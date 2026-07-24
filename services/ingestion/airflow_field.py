"""Campo de fluxo 2D por potencial numa grade grossa — o "moat" do viewer.

NÃO é CFD e NÃO é medição: é uma ESTIMATIVA de campo, o passo seguinte às
béziers heurísticas. Sobre o mapa REAL de obstáculos (as placements em mm que o
motor já produz), resolve-se um escoamento de potencial e derivam-se linhas de
corrente que CONTORNAM as peças de facto, além de um campo térmico contínuo.

Modelo (escoamento incompressível de potencial, análogo a Darcy):
    u = -∇p ,      ∇·u = f            (f: fontes nos intakes, drenos nos exhausts)
  ⇒ ∇²p = -f       com  ∂p/∂n = 0     em TODA a fronteira sólida (paredes + peças)

A condição de fluxo-nulo nas paredes das peças é o que faz a corrente ser
TANGENTE ao obstáculo — as linhas desviam à volta da GPU sozinhas, sem regra
ad-hoc. Resolve-se por SOR (Gauss-Seidel sobre-relaxado) com saída antecipada
por resíduo, em arrays achatados com vizinhança pré-computada (puro-Python,
sem numpy, determinístico e rápido o suficiente para correr por request).

Térmico (#3): advecção-difusão estacionária de T sobre a MESMA grade e o MESMO
campo u — fontes de calor nas peças (GPU/CPU por TDP), ambiente injetado nos
intakes. Upwind + difusão, relaxação de Gauss-Seidel. Devolve T normalizado.

NOTA DE MODELAÇÃO: a placa-mãe NÃO é obstáculo. Nesta vista lateral ela é o
plano de fundo — o ar corre à frente dela, contornando o que se projeta para
fora (GPU, torre/AIO, RAM) e o porão da fonte sob o shroud.

INTEGRIDADE: é campo de ESTIMATIVA. O score/diagnóstico auditados continuam a
vir do grafo de zonas; isto enriquece o DESENHO, não altera número nenhum.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple


def _rects_contain(rects: List[dict], x: float, y: float, inflate: float = 0.0) -> bool:
    for r in rects:
        if (r["x"] - inflate <= x <= r["x"] + r["w"] + inflate
                and r["y"] - inflate <= y <= r["y"] + r["h"] + inflate):
            return True
    return False


def _side_of(op: dict, D: float, H: float) -> str:
    """Lado da abertura (parede em que assenta), pela posição do centro."""
    cx = op["x"] + op.get("w", 0) / 2
    cy = op["y"] + op.get("h", 0) / 2
    if cy > H * 0.8 and op.get("w", 0) >= op.get("h", 0):
        return "top"
    if cy < H * 0.2 and op.get("w", 0) >= op.get("h", 0):
        return "bottom"
    return "front" if cx < D * 0.5 else "rear"


def solve_flow_field(
    D: float, H: float, shroud_h: float,
    obstacles: List[dict],
    intakes: List[dict],
    exhausts: List[dict],
    heat_sources: Optional[List[dict]] = None,
    *,
    grid_max: int = 34,
    max_streamlines: int = 14,
) -> Optional[dict]:
    """Resolve o campo e devolve streamlines (mm) + térmico normalizado.

    obstacles/intakes/exhausts/heat_sources: dicts com x,y,w,h em mm; intakes e
    exhausts trazem `cfm`; heat_sources trazem `watts`. Devolve None se a
    geometria for degenerada (sem entrada ou sem saída — nada a solver)."""
    if D <= 0 or H <= 0 or not intakes or not exhausts:
        return None
    heat_sources = heat_sources or []

    # ---- grade ----
    cell = max(D, H) / grid_max
    C = max(6, int(round(D / cell)))
    R = max(6, int(round(H / cell)))
    dx = D / C
    dy = H / R
    N = C * R
    xc = [(i + 0.5) * dx for i in range(C)]
    yc = [(j + 0.5) * dy for j in range(R)]

    # ---- máscara sólida: peças + porão sob o shroud ----
    solid = [False] * N
    for j in range(R):
        y = yc[j]
        base = j * C
        below = y < shroud_h
        for i in range(C):
            if below or _rects_contain(obstacles, xc[i], y, inflate=-dx * 0.15):
                solid[base + i] = True
    fluid_idx = [k for k in range(N) if not solid[k]]
    if len(fluid_idx) < 12:
        return None

    # ---- vizinhança pré-computada (índice próprio quando o vizinho é sólido:
    #      equivale a gradiente nulo naquela face = parede impermeável) ----
    ie = list(range(N)); iw = list(range(N)); jn = list(range(N)); js = list(range(N))
    nbrs: List[Tuple[int, ...]] = [()] * N
    for k in fluid_idx:
        j, i = divmod(k, C)
        ns: List[int] = []
        if i + 1 < C and not solid[k + 1]:
            ie[k] = k + 1; ns.append(k + 1)
        if i - 1 >= 0 and not solid[k - 1]:
            iw[k] = k - 1; ns.append(k - 1)
        if j + 1 < R and not solid[k + C]:
            jn[k] = k + C; ns.append(k + C)
        if j - 1 >= 0 and not solid[k - C]:
            js[k] = k - C; ns.append(k - C)
        nbrs[k] = tuple(ns)

    def fluid_at(i: int, j: int) -> bool:
        return 0 <= i < C and 0 <= j < R and not solid[j * C + i]

    # ---- células de borda de cada abertura (onde se injeta/extrai) ----
    def edge_cells(op: dict) -> List[int]:
        side = _side_of(op, D, H)
        out: List[int] = []
        if side in ("front", "rear"):
            j0 = max(0, int(op["y"] / dy))
            j1 = min(R - 1, int((op["y"] + op["h"]) / dy))
            rng = range(C) if side == "front" else range(C - 1, -1, -1)
            for j in range(j0, j1 + 1):
                for i in rng:            # primeira célula fluida a partir da parede
                    if not solid[j * C + i]:
                        out.append(j * C + i)
                        break
        else:
            i0 = max(0, int(op["x"] / dx))
            i1 = min(C - 1, int((op["x"] + op["w"]) / dx))
            rng = range(R - 1, -1, -1) if side == "top" else range(R)
            for i in range(i0, i1 + 1):
                for j in rng:
                    if not solid[j * C + i]:
                        out.append(j * C + i)
                        break
        return out

    # ---- termo-fonte f (Σ=0): +intakes por quota de cfm, -exhausts idem ----
    f = [0.0] * N
    tot_in = sum(max(0.0, o.get("cfm", 0.0)) for o in intakes) or 1.0
    tot_out = sum(max(0.0, o.get("cfm", 0.0)) for o in exhausts) or 1.0
    for op in intakes:
        cells = edge_cells(op)
        if cells:
            q = (max(0.0, op.get("cfm", 0.0)) / tot_in) / len(cells)
            for k in cells:
                f[k] += q
    for op in exhausts:
        cells = edge_cells(op)
        if cells:
            q = (max(0.0, op.get("cfm", 0.0)) / tot_out) / len(cells)
            for k in cells:
                f[k] -= q
    s = sum(f[k] for k in fluid_idx)
    if abs(s) > 1e-12:                      # Neumann exige Σf = 0
        adj = s / len(fluid_idx)
        for k in fluid_idx:
            f[k] -= adj

    # ---- Poisson ∇²p = -f, Neumann, SOR sobre lista achatada ----
    cell2 = dx * dy
    p = [0.0] * N
    sweep = [(k, nbrs[k], len(nbrs[k]), f[k] * cell2) for k in fluid_idx if nbrs[k]]
    omega = 1.75
    for _ in range(300):
        resid = 0.0
        for (k, ns, n, fc) in sweep:
            acc = 0.0
            for t in ns:
                acc += p[t]
            d = omega * ((acc + fc) / n - p[k])
            p[k] += d
            if d > resid:
                resid = d
            elif -d > resid:
                resid = -d
        if resid < 1e-5:
            break

    # ---- velocidade u = -∇p (tangente às paredes por construção) ----
    ux = [0.0] * N
    uy = [0.0] * N
    i2dx = 1.0 / (2 * dx)
    i2dy = 1.0 / (2 * dy)
    umax = 1e-9
    for k in fluid_idx:
        vx = -(p[ie[k]] - p[iw[k]]) * i2dx
        vy = -(p[jn[k]] - p[js[k]]) * i2dy
        ux[k] = vx; uy[k] = vy
        m = (vx * vx + vy * vy) ** 0.5
        if m > umax:
            umax = m

    def sample_u(x: float, y: float) -> Tuple[float, float]:
        gi = x / dx - 0.5
        gj = y / dy - 0.5
        if gi < 0: gi = 0.0
        elif gi > C - 1: gi = C - 1.0
        if gj < 0: gj = 0.0
        elif gj > R - 1: gj = R - 1.0
        i0 = int(gi); j0 = int(gj)
        i1 = i0 + 1 if i0 + 1 < C else i0
        j1 = j0 + 1 if j0 + 1 < R else j0
        tx = gi - i0; ty = gj - j0
        a = j0 * C + i0; b = j0 * C + i1; c = j1 * C + i0; d_ = j1 * C + i1
        vx = ((ux[a] * (1 - tx) + ux[b] * tx) * (1 - ty)
              + (ux[c] * (1 - tx) + ux[d_] * tx) * ty)
        vy = ((uy[a] * (1 - tx) + uy[b] * tx) * (1 - ty)
              + (uy[c] * (1 - tx) + uy[d_] * tx) * ty)
        return vx, vy

    def in_solid_xy(x: float, y: float) -> bool:
        i = int(x / dx); j = int(y / dy)
        if i < 0: i = 0
        elif i >= C: i = C - 1
        if j < 0: j = 0
        elif j >= R: j = R - 1
        return solid[j * C + i]

    # ---- streamlines: integra u a partir das bordas de intake ----
    exhaust_cells = set()
    for op in exhausts:
        exhaust_cells.update(edge_cells(op))

    def near_exhaust(x: float, y: float) -> bool:
        # SÓ o lado de saída conta como fim — a parede frontal é intake
        i = int(x / dx); j = int(y / dy)
        if i < 0: i = 0
        elif i >= C: i = C - 1
        if j < 0: j = 0
        elif j >= R: j = R - 1
        return (j * C + i) in exhaust_cells or x >= D - dx or y >= H - dy

    step_len = (dx if dx < dy else dy) * 0.6
    seeds: List[Tuple[float, float]] = []
    for op in intakes:
        cells = edge_cells(op)
        if not cells:
            continue
        stride = max(1, len(cells) // 8)
        for n in range(0, len(cells), stride):
            k = cells[n]
            j, i = divmod(k, C)
            sx, sy = xc[i], yc[j]
            # empurra a semente para DENTRO ao longo de u — nascer colada à
            # parede estagna a integração
            vx, vy = sample_u(sx, sy)
            m = (vx * vx + vy * vy) ** 0.5
            if m > 0:
                sx += vx / m * step_len * 1.5
                sy += vy / m * step_len * 1.5
            if not in_solid_xy(sx, sy):
                seeds.append((sx, sy))
    seeds = seeds[:max_streamlines]

    streamlines: List[dict] = []
    stall = umax * 0.02
    for (sx, sy) in seeds:
        x, y = sx, sy
        pts = [[round(x, 1), round(y, 1)]]
        spd: List[float] = []
        for _ in range(400):
            vx, vy = sample_u(x, y)
            m = (vx * vx + vy * vy) ** 0.5
            spd.append(round(m / umax, 3))
            if m < stall:
                break
            hx = x + vx / m * step_len * 0.5
            hy = y + vy / m * step_len * 0.5
            vx2, vy2 = sample_u(hx, hy)
            m2 = (vx2 * vx2 + vy2 * vy2) ** 0.5 or 1.0
            nx = x + vx2 / m2 * step_len
            ny = y + vy2 / m2 * step_len
            if in_solid_xy(nx, ny):
                break
            x, y = nx, ny
            pts.append([round(x, 1), round(y, 1)])
            if near_exhaust(x, y):
                break
        if len(pts) >= 4:
            streamlines.append({"pts": pts, "speed": spd})

    thermal = _solve_thermal(C, R, N, dx, dy, xc, yc, solid, fluid_idx, nbrs,
                             ie, iw, jn, js, ux, uy, umax, heat_sources,
                             intakes, edge_cells)

    return {
        "grid": {"cols": C, "rows": R, "cell_mm": round((dx + dy) / 2, 2),
                 "dx": round(dx, 2), "dy": round(dy, 2)},
        "streamlines": streamlines,
        "speed_max": round(umax, 5),
        "thermal": thermal,
        "method": "potential_grid_estimate",
    }


def _solve_thermal(C, R, N, dx, dy, xc, yc, solid, fluid_idx, nbrs,
                   ie, iw, jn, js, ux, uy, umax, heat_sources,
                   intakes, edge_cells) -> dict:
    """T estacionário: u·∇T = κ∇²T + Q (upwind + difusão, Gauss-Seidel).
    Ambiente (T=0) fixado nas bordas de intake. Devolve T normalizado 0..1."""
    Q = [0.0] * N
    watt_max = max((h.get("watts", 0.0) for h in heat_sources), default=0.0) or 1.0
    for k in fluid_idx:
        j, i = divmod(k, C)
        x, y = xc[i], yc[j]
        acc = 0.0
        for h in heat_sources:
            # o calor entra no fluido À VOLTA da peça (a peça é sólida)
            if (h["x"] - dx <= x <= h["x"] + h["w"] + dx
                    and h["y"] - dy <= y <= h["y"] + h["h"] + dy):
                acc += h.get("watts", 0.0) / watt_max
        Q[k] = acc

    inlet = set()
    for op in intakes:
        inlet.update(edge_cells(op))

    kappa = 0.35
    uref = umax or 1e-9
    T = [0.0] * N
    # pré-computa por célula: (k, upwind_x, ax, upwind_y, ay, vizinhos, n)
    cells = []
    for k in fluid_idx:
        if k in inlet or not nbrs[k]:
            continue
        vx = ux[k] / uref
        vy = uy[k] / uref
        ax = vx if vx > 0 else -vx
        ay = vy if vy > 0 else -vy
        ux_src = iw[k] if vx > 0 else ie[k]
        uy_src = js[k] if vy > 0 else jn[k]
        if ux_src == k:
            ax = 0.0
        if uy_src == k:
            ay = 0.0
        cells.append((k, ux_src, ax, uy_src, ay, nbrs[k], len(nbrs[k]), Q[k]))

    for _ in range(140):
        for (k, uxs, ax, uys, ay, ns, n, q) in cells:
            acc = 0.0
            for t in ns:
                acc += T[t]
            num = ax * T[uxs] + ay * T[uys] + kappa * acc + q
            den = ax + ay + kappa * n
            if den > 0:
                T[k] = num / den

    tmax = 0.0
    for k in fluid_idx:
        if T[k] > tmax:
            tmax = T[k]
    tmax = tmax or 1.0
    grid = [[(round(T[j * C + i] / tmax, 3) if not solid[j * C + i] else -1.0)
             for i in range(C)] for j in range(R)]
    return {"cols": C, "rows": R, "t": grid, "t_max": round(tmax, 3)}
