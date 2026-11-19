"""Rota glTF — o gabinete em 3D, gerado a partir do MOTOR DE GEOMETRIA.

O doc de 2026-07-06 desenhava esta rota como geração de malha por IA (Meshy /
Tripo3D) a partir da foto do feed, depois "normalizada às dimensões reais". A
emenda de 2026-07-23 suspendeu-a por três razões, e duas continuam de pé:
malha gerada é opaca (não é revisável nem diffável) e — a séria — um gerador
que produz a malha E a dimensão pode MENTIR SOBRE TAMANHO, que é exactamente a
regra que o produto não pode quebrar.

Aqui a rota é feita ao contrário, e por isso pode existir hoje:

    motor de geometria (mm, auditado)  ─┐
                                        ├─→  glTF 2.0 determinístico
    descritor aprovado (aparência)     ─┘

A malha É a geometria do motor — as mesmas placements em mm que desenham a
vista 2D. Não há um segundo gerador de dimensão, logo não há nada que possa
divergir do que o site afirma. O descritor entra só onde entra no 2D: quantas
ventoinhas, se há backplate, se acende. Sem foto, sem serviço externo, sem
custo por peça e sem a questão de licenciamento de uma malha derivada da foto
de um fabricante.

EIXOS: glTF é Y-up, metros. O motor é x→traseira, y→cima, em mm; a terceira
dimensão (largura, bandeja→vidro) vem de `case.width_mm`, que é DERIVADO da
altura máxima de cooler. Tudo é dividido por 1000.

INTEGRIDADE: continua a ser ESTIMATIVA dimensional. Cada nó leva em `extras` a
origem da sua medida (`spec` / `form_factor_default` / `derivado`), e o
`asset.extras` repete a régua da casa — porque o ficheiro circula sozinho, sem
a página à volta.
"""
from __future__ import annotations

import base64
import math
import struct
from typing import Any, Dict, List, Optional, Tuple

# ── paleta (mesmos tokens da marca, resolvidos — glTF não tem var(--…)) ──────
_HEX = {
    "chassis": "#17181b", "panel": "#2A2D34", "line": "#3a3c42",
    "board": "#1d3326", "accent": "#C9A24B", "fresh": "#7BA86A",
    "warn": "#E0A93B", "danger": "#C85348", "glass": "#8fa3b0",
}


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _color(name: str) -> List[float]:
    h = _HEX[name].lstrip("#")
    return [round(_srgb_to_linear(int(h[i:i + 2], 16) / 255.0), 5) for i in (0, 2, 4)] + [1.0]


# ── primitivas: cubo e cilindro, ambos UNITÁRIOS e CENTRADOS na origem ──────
# Centrados torna cada nó trivial: translation = centro, scale = tamanho.
def _cube() -> Tuple[List[float], List[float], List[int]]:
    faces = [
        ((1, 0, 0), [(.5, -.5, -.5), (.5, .5, -.5), (.5, .5, .5), (.5, -.5, .5)]),
        ((-1, 0, 0), [(-.5, -.5, .5), (-.5, .5, .5), (-.5, .5, -.5), (-.5, -.5, -.5)]),
        ((0, 1, 0), [(-.5, .5, -.5), (-.5, .5, .5), (.5, .5, .5), (.5, .5, -.5)]),
        ((0, -1, 0), [(-.5, -.5, .5), (-.5, -.5, -.5), (.5, -.5, -.5), (.5, -.5, .5)]),
        ((0, 0, 1), [(-.5, -.5, .5), (.5, -.5, .5), (.5, .5, .5), (-.5, .5, .5)]),
        ((0, 0, -1), [(.5, -.5, -.5), (-.5, -.5, -.5), (-.5, .5, -.5), (.5, .5, -.5)]),
    ]
    pos: List[float] = []
    nrm: List[float] = []
    idx: List[int] = []
    for f, (n, quad) in enumerate(faces):
        for v in quad:
            pos.extend(v)
            nrm.extend(n)
        b = f * 4
        idx.extend([b, b + 1, b + 2, b, b + 2, b + 3])
    return pos, nrm, idx


def _cylinder(seg: int = 16) -> Tuple[List[float], List[float], List[int]]:
    """Raio .5 em XZ, altura 1 em Y, centrado. Roda-se por quaternião."""
    pos: List[float] = []
    nrm: List[float] = []
    idx: List[int] = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        x, z = 0.5 * math.cos(a), 0.5 * math.sin(a)
        nx, nz = math.cos(a), math.sin(a)
        pos.extend([x, -0.5, z]); nrm.extend([nx, 0, nz])
        pos.extend([x, 0.5, z]);  nrm.extend([nx, 0, nz])
    for i in range(seg):
        a, b = 2 * i, 2 * ((i + 1) % seg)
        idx.extend([a, b, a + 1, b, b + 1, a + 1])
    # tampas
    for sign, ny in ((-0.5, -1.0), (0.5, 1.0)):
        c = len(pos) // 3
        pos.extend([0.0, sign, 0.0]); nrm.extend([0.0, ny, 0.0])
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            pos.extend([0.5 * math.cos(a), sign, 0.5 * math.sin(a)])
            nrm.extend([0.0, ny, 0.0])
            ring.append(c + 1 + i)
        for i in range(seg):
            p, q = ring[i], ring[(i + 1) % seg]
            idx.extend([c, p, q] if ny > 0 else [c, q, p])
    return pos, nrm, idx


def _ring(seg: int = 28, inner: float = 0.41) -> Tuple[List[float], List[float], List[int]]:
    """Anel (coroa circular com espessura): raio externo .5, interno `inner`,
    altura 1 em Y, centrado. É a moldura de TODA ventoinha do modelo."""
    pos: List[float] = []
    nrm: List[float] = []
    idx: List[int] = []

    def quad(a, b, c, d, n):
        base = len(pos) // 3
        for v in (a, b, c, d):
            pos.extend(v)
            nrm.extend(n)
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    for i in range(seg):
        a0 = 2 * math.pi * i / seg
        a1 = 2 * math.pi * (i + 1) / seg
        c0, s0, c1, s1 = math.cos(a0), math.sin(a0), math.cos(a1), math.sin(a1)
        o0, o1 = (0.5 * c0, 0.5 * s0), (0.5 * c1, 0.5 * s1)
        i0, i1 = (inner * c0, inner * s0), (inner * c1, inner * s1)
        # face externa e interna (normais radiais), topo e base (±Y)
        quad((o0[0], -.5, o0[1]), (o1[0], -.5, o1[1]), (o1[0], .5, o1[1]), (o0[0], .5, o0[1]), (c0, 0, s0))
        quad((i1[0], -.5, i1[1]), (i0[0], -.5, i0[1]), (i0[0], .5, i0[1]), (i1[0], .5, i1[1]), (-c0, 0, -s0))
        quad((o0[0], .5, o0[1]), (o1[0], .5, o1[1]), (i1[0], .5, i1[1]), (i0[0], .5, i0[1]), (0, 1, 0))
        quad((i0[0], -.5, i0[1]), (i1[0], -.5, i1[1]), (o1[0], -.5, o1[1]), (o0[0], -.5, o0[1]), (0, -1, 0))
    return pos, nrm, idx


def _qmul(a: List[float], b: List[float]) -> List[float]:
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz]


def _qaxis(x: float, y: float, z: float, ang: float) -> List[float]:
    h = ang / 2
    sn = math.sin(h)
    return [x * sn, y * sn, z * sn, math.cos(h)]


#: quaterniões para apontar o eixo do cilindro (nativo +Y) noutra direcção
_ROT = {
    "y": None,                                    # já é +Y
    "x": [0.0, 0.0, -0.70710678, 0.70710678],     # -90° em Z
    "z": [0.70710678, 0.0, 0.0, 0.70710678],      # +90° em X
}


class _Buf:
    """Empacota os dois meshes num único buffer embebido em base64."""

    def __init__(self) -> None:
        self.blob = bytearray()
        self.views: List[dict] = []
        self.accessors: List[dict] = []

    def _pad(self) -> None:
        while len(self.blob) % 4:
            self.blob.append(0)

    def add_f32(self, data: List[float], comps: int, minmax: bool) -> int:
        self._pad()
        off = len(self.blob)
        self.blob.extend(struct.pack("<%df" % len(data), *data))
        self.views.append({"buffer": 0, "byteOffset": off,
                           "byteLength": len(data) * 4, "target": 34962})
        acc: Dict[str, Any] = {"bufferView": len(self.views) - 1, "componentType": 5126,
                               "count": len(data) // comps,
                               "type": {2: "VEC2", 3: "VEC3"}[comps]}
        if minmax:   # obrigatório para POSITION
            cols = [data[i::comps] for i in range(comps)]
            acc["min"] = [min(c) for c in cols]
            acc["max"] = [max(c) for c in cols]
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def add_u16(self, data: List[int]) -> int:
        self._pad()
        off = len(self.blob)
        self.blob.extend(struct.pack("<%dH" % len(data), *data))
        self.views.append({"buffer": 0, "byteOffset": off,
                           "byteLength": len(data) * 2, "target": 34963})
        self.accessors.append({"bufferView": len(self.views) - 1, "componentType": 5123,
                               "count": len(data), "type": "SCALAR"})
        return len(self.accessors) - 1


#: espessura ao longo da LARGURA (bandeja→vidro) por peça, em mm.
#: onde há dado real usa-se o dado real; o resto é padrão de form factor e vai
#: rotulado como tal em `extras.fonte`.
_Z_DEFAULT = {
    "motherboard": (4.0, "form_factor_default"),
    "cpu_socket": (8.0, "form_factor_default"),
    "ram": (31.0, "form_factor_default"),
    "m2_ssd": (3.0, "form_factor_default"),
    "psu": (150.0, "form_factor_default"),
    "aio_pump": (55.0, "form_factor_default"),
    "aio_radiator": (120.0, "form_factor_default"),
    "aio_fans": (120.0, "form_factor_default"),
    "case_fan": (120.0, "form_factor_default"),
}


def build_gltf(est: dict) -> dict:
    """Constrói o glTF 2.0 a partir da resposta do /interior/estimate."""
    g = est.get("geometry")
    if not g:
        raise ValueError("sem geometria: nada a modelar")

    D = float(g["case"]["depth_mm"])
    H = float(g["case"]["height_mm"])
    W = float(g["case"].get("width_mm") or 170.0)
    shroud = float(g["case"].get("shroud_h_mm") or 0.0)
    parts = est.get("parts") or {}
    visuals = est.get("visuals") or {}
    gpu_thick = parts.get("gpu", {}).get("thickness_mm") or 41.0
    cooler_h = parts.get("cooler", {}).get("height_mm") or 0.0

    S = 0.001  # mm → m
    buf = _Buf()
    cp, cn, ci = _cube()
    cube_p, cube_n, cube_i = buf.add_f32(cp, 3, True), buf.add_f32(cn, 3, False), buf.add_u16(ci)
    yp, yn, yi = _cylinder()
    cyl_p, cyl_n, cyl_i = buf.add_f32(yp, 3, True), buf.add_f32(yn, 3, False), buf.add_u16(yi)
    rp, rn, ri = _ring()
    ring_p, ring_n, ring_i = buf.add_f32(rp, 3, True), buf.add_f32(rn, 3, False), buf.add_u16(ri)

    meshes: List[dict] = []   # um mesh por (primitiva × material)

    mat_names = ["chassis", "panel", "board", "accent", "fresh", "warn", "danger", "glass", "line"]
    materials = []
    for n in mat_names:
        m: Dict[str, Any] = {"name": n, "pbrMetallicRoughness": {
            "baseColorFactor": _color(n), "metallicFactor": 0.15, "roughnessFactor": 0.75}}
        if n == "glass":
            m["pbrMetallicRoughness"]["baseColorFactor"][3] = 0.12
            m["alphaMode"] = "BLEND"
            m["doubleSided"] = True
        materials.append(m)
    MAT = {n: i for i, n in enumerate(mat_names)}

    nodes: List[dict] = []
    roots: List[int] = []   # nós de topo da cena (filhos de uma ventoinha não entram)

    def _root(n: dict) -> int:
        nodes.append(n)
        roots.append(len(nodes) - 1)
        return len(nodes) - 1

    def box(name: str, cx: float, cy: float, cz: float,
            sx: float, sy: float, sz: float, mat: str, fonte: str) -> None:
        if sx <= 0 or sy <= 0 or sz <= 0:
            return
        # material por-nó não existe em glTF: o material vive na primitiva,
        # por isso há um mesh (cubo) por material, partilhando os acessores
        _root({
            "name": name, "mesh": _mesh_for(mat),
            "translation": [round(cx * S, 6), round(cy * S, 6), round(cz * S, 6)],
            "scale": [round(sx * S, 6), round(sy * S, 6), round(sz * S, 6)],
            "extras": {"fonte": fonte},
        })

    _mesh_cache: Dict[str, int] = {}

    def _mesh_for(mat: str) -> int:
        """Um mesh (cubo) por material — glTF põe o material na primitiva."""
        if mat not in _mesh_cache:
            meshes.append({"name": f"cubo-{mat}", "primitives": [
                {"attributes": {"POSITION": cube_p, "NORMAL": cube_n},
                 "indices": cube_i, "material": MAT[mat]}]})
            _mesh_cache[mat] = len(meshes) - 1
        return _mesh_cache[mat]

    _cyl_cache: Dict[str, int] = {}

    def _cyl_for(mat: str) -> int:
        if mat not in _cyl_cache:
            meshes.append({"name": f"cil-{mat}", "primitives": [
                {"attributes": {"POSITION": cyl_p, "NORMAL": cyl_n},
                 "indices": cyl_i, "material": MAT[mat]}]})
            _cyl_cache[mat] = len(meshes) - 1
        return _cyl_cache[mat]

    def disc(name: str, cx: float, cy: float, cz: float, r: float, th: float,
             axis: str, mat: str, fonte: str) -> None:
        n: Dict[str, Any] = {
            "name": name, "mesh": _cyl_for(mat),
            "translation": [round(cx * S, 6), round(cy * S, 6), round(cz * S, 6)],
            "scale": [round(2 * r * S, 6), round(th * S, 6), round(2 * r * S, 6)],
            "extras": {"fonte": fonte},
        }
        if _ROT[axis]:
            n["rotation"] = _ROT[axis]
        _root(n)

    _ring_cache: Dict[str, int] = {}

    def _ring_for(mat: str) -> int:
        if mat not in _ring_cache:
            meshes.append({"name": f"anel-{mat}", "primitives": [
                {"attributes": {"POSITION": ring_p, "NORMAL": ring_n},
                 "indices": ring_i, "material": MAT[mat]}]})
            _ring_cache[mat] = len(meshes) - 1
        return _ring_cache[mat]

    def fan(name: str, cx: float, cy: float, cz: float, size: float, th: float,
            axis: str, ring_mat: str, fonte: str, blades: int = 7) -> None:
        """UMA ventoinha, sempre igual: moldura em anel (a cor diz entra/sai),
        pás inclinadas e cubo central. Gabinete, GPU, cooler e radiador usam
        esta mesma peça — só mudam tamanho, espessura, eixo e cor da moldura.
        O nó-pai leva o nome (o 3D da página escolhe a peça por ele)."""
        q_axis = _ROT[axis] or [0.0, 0.0, 0.0, 1.0]
        kids: List[int] = []

        def child(mesh: int, t: List[float], sc: List[float], rot: Optional[List[float]] = None) -> None:
            n: Dict[str, Any] = {"mesh": mesh, "translation": [round(v * S, 6) for v in t],
                                 "scale": [round(v * S, 6) for v in sc]}
            if rot:
                n["rotation"] = [round(v, 6) for v in rot]
            nodes.append(n)
            kids.append(len(nodes) - 1)

        # moldura e cubo, no referencial do pai (eixo da ventoinha = +Y)
        child(_ring_for(ring_mat), [0, 0, 0], [size, th, size])
        child(_cyl_for("panel"), [0, 0, 0], [size * 0.26, th * 0.92, size * 0.26])
        pitch = _qaxis(1, 0, 0, math.radians(28))
        for k in range(blades):
            a = 2 * math.pi * k / blades
            q = _qmul(_qaxis(0, 1, 0, -a), pitch)
            rmid = size * 0.27
            child(_mesh_for("line"), [rmid * math.cos(a), 0, rmid * math.sin(a)],
                  [size * 0.27, th * 0.18, size * 0.12], q)
        _root({
            "name": name, "children": kids,
            "translation": [round(cx * S, 6), round(cy * S, 6), round(cz * S, 6)],
            "rotation": [round(v, 8) for v in q_axis],
            "extras": {"fonte": fonte},
        })

    # ── casca do gabinete: 5 painéis, lado do vidro aberto para se ver dentro ──
    T = 3.0
    box("chassi-piso", D / 2, -T / 2, W / 2, D, T, W, "chassis", "derivado")
    box("chassi-teto", D / 2, H + T / 2, W / 2, D, T, W, "chassis", "derivado")
    box("chassi-traseira", D + T / 2, H / 2, W / 2, T, H, W, "chassis", "derivado")
    box("chassi-frente", -T / 2, H / 2, W / 2, T, H, W, "chassis", "derivado")
    box("bandeja", D / 2, H / 2, -T / 2, D, H, T, "chassis", "derivado")
    box("vidro-lateral", D / 2, H / 2, W + T / 2, D, H, T, "glass", "derivado")
    if shroud > 0:
        box("shroud-fonte", D / 2, shroud - T / 2, W / 2, D, T, W, "panel", "form_factor_default")

    # ── peças, a partir das placements do motor (x,y,w,h em mm) ──────────────
    for p in g.get("placements", []):
        part = p["part"]
        px, py = float(p["x"]), float(p["y"])
        pw, ph = float(p["w"]), float(p["h"])
        fonte = p.get("source", "form_factor_default")

        if part == "gpu":
            z0, zt, fz = 4.0, float(gpu_thick), "slots × passo (típico)"
            box("gpu", px + pw / 2, py + ph / 2, z0 + zt / 2, pw, ph, zt, "panel", fz)
            d = (visuals.get("gpu") or {}).get("descriptor") or {}
            n_fans = int(d.get("fans") or 0)
            for i in range(n_fans):
                cx = px + pw * (i + 0.5) / n_fans
                fan(f"gpu-fan-{i}", cx, py + ph / 2, z0 + zt + 2.0,
                    min(ph * 0.86, pw / n_fans * 0.9), 4.0, "z", "line", "descritor")
            if d.get("backplate"):
                box("gpu-backplate", px + pw / 2, py + ph + 2.0, z0 + zt / 2,
                    pw, 3.0, zt, "line", "descritor")
            if d.get("lighting") not in (None, "none"):
                box("gpu-luz", px + pw / 2, py + 2.0, z0 + zt + 1.0,
                    pw * 0.92, 3.0, 2.0, "accent", "descritor")
            continue

        if part == "air_cooler":
            zt = cooler_h if cooler_h > 0 else 120.0
            fz = "spec (altura = vão bandeja→tampa)" if cooler_h > 0 else "form_factor_default"
            box("cooler", px + pw / 2, py + ph / 2, 4.0 + zt / 2, pw, ph, zt, "panel", fz)
            fan("cooler-fan", px - 12.5, py + ph / 2, 4.0 + zt / 2,
                min(ph, zt) * 0.92, 25.0, "x", "line", "form_factor_default")
            continue

        if part == "case_fan":
            # face e posição na largura vêm do mount (case_mounts); sem elas, o
            # palpite antigo (deitada = topo, em pé = parede, centro da largura)
            face = p.get("face")
            wide = p.get("wide") is True
            n = max(1, int(p.get("fan_count") or 1))
            zc = float(p["z"]) if p.get("z") is not None else W / 2
            ring = ("accent" if p.get("simulated") else
                    "fresh" if p.get("orient") == "intake" else
                    "warn" if p.get("orient") == "exhaust" else
                    ("fresh" if px < D * 0.3 else "warn"))
            src = "spec" if not p.get("simulated") else "simulado"
            if face == "side":
                # na tampa: de frente para quem olha pelo vidro
                fan(f"fan-{p.get('mount', '')}-0", px + pw / 2, py + ph / 2, zc,
                    min(pw, ph) * 0.9, 25.0, "z", ring, src)
                continue
            size = min((pw if wide else ph) / n * 0.92, float(p.get("d") or W) * 0.95)
            for i in range(n):
                t = (i + 0.5) / n
                cx = px + pw * t if wide else px + pw / 2
                cy = py + ph / 2 if wide else py + ph * t
                if face == "bottom" and shroud > 0:
                    # na cobertura da fonte: metade acima da chapa — rente a
                    # ela a ventoinha sumia debaixo da tampa
                    cy = shroud
                fan(f"fan-{p.get('mount', '')}-{i}", cx, cy, zc, size, 25.0,
                    "y" if wide else "x", ring, src)
            continue

        if part == "aio_fans":
            # a fila de ventoinhas do radiador: a mesma ventoinha, deitada
            n = max(1, int(p.get("fan_count") or 3))
            size = min(pw / n * 0.94, 120.0)
            for i in range(n):
                fan(f"aio_fans-{i}", px + pw * (i + 0.5) / n, py + ph / 2, W / 2, size, ph,
                    "y", "warn", "form_factor_default")
            continue

        zt, fz = _Z_DEFAULT.get(part, (20.0, "form_factor_default"))
        zt = min(zt, W - 6.0)
        mat = {"motherboard": "board", "psu": "panel", "ram": "panel",
               "aio_radiator": "panel", "aio_fans": "line"}.get(part, "panel")
        box(part, px + pw / 2, py + ph / 2, 4.0 + zt / 2, pw, ph, zt, mat, fz)

    buf._pad()
    b64 = base64.b64encode(bytes(buf.blob)).decode("ascii")

    return {
        "asset": {
            "version": "2.0",
            "generator": "Rei do FPS — motor de geometria paramétrica",
            "copyright": "reidofps.com.br",
            "extras": {
                "nota": ("ESTIMATIVA dimensional — não é medição. A malha é a mesma "
                         "geometria em mm que desenha a vista 2D do site."),
                "unidades": "metros (mm/1000)",
                "eixos": "X = profundidade (frente→traseira) · Y = altura · Z = largura (bandeja→vidro)",
                "largura_derivada": bool(g["case"].get("width_is_derived", True)),
                "gabinete": est.get("case", {}).get("name"),
                "metodo_fluxo": est.get("method"),
            },
        },
        "scene": 0,
        "scenes": [{"name": "gabinete", "nodes": roots}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": buf.accessors,
        "bufferViews": buf.views,
        "buffers": [{"byteLength": len(buf.blob),
                     "uri": "data:application/octet-stream;base64," + b64}],
    }
