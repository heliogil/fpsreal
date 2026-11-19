"""glTF: toda ventoinha é a mesma peça (anel + pás + cubo) e a árvore é válida."""
from gltf_builder import build_gltf


def _est():
    g = {"case": {"depth_mm": 470, "height_mm": 440, "width_mm": 190, "shroud_h_mm": 80},
         "placements": [
             {"part": "gpu", "x": 80, "y": 150, "w": 359, "h": 71, "source": "spec"},
             {"part": "air_cooler", "x": 250, "y": 250, "w": 100, "h": 115, "source": "spec"},
             {"part": "aio_fans", "x": 40, "y": 385, "w": 398, "h": 25, "fan_count": 3},
             {"part": "case_fan", "x": 0, "y": 15, "w": 28, "h": 140, "face": "front",
              "orient": "intake", "z": 95, "d": 140, "mount": "front_bottom"},
             {"part": "case_fan", "x": 30, "y": 55, "w": 250, "h": 25, "face": "bottom", "orient": "intake",
              "z": 95, "d": 120, "fan_count": 2, "wide": True, "mount": "shroud"},
             {"part": "case_fan", "x": 30, "y": 412, "w": 420, "h": 25, "face": "top", "orient": "exhaust",
              "z": 95, "d": 120, "wide": True, "mount": "top_bay", "simulated": True},
         ]}
    return {"geometry": g, "parts": {"gpu": {"thickness_mm": 71}, "cooler": {"height_mm": 155}},
            "visuals": {"gpu": {"descriptor": {"fans": 3}}}, "case": {"name": "teste"}}


def test_tree_is_valid():
    o = build_gltf(_est())
    roots = o["scenes"][0]["nodes"]
    kids = {c for n in o["nodes"] for c in n.get("children", [])}
    assert not set(roots) & kids                       # filho nunca é raiz
    assert set(roots) | kids == set(range(len(o["nodes"])))   # nenhum nó solto


def test_every_fan_is_the_same_part():
    o = build_gltf(_est())
    fans = [n for n in o["nodes"] if "fan" in (n.get("name") or "")]
    names = {n["name"] for n in fans}
    assert {"gpu-fan-0", "cooler-fan", "aio_fans-0", "fan-front_bottom-0", "fan-shroud-1", "fan-top_bay-0"} <= names
    for f in fans:
        kids = [o["nodes"][i] for i in f["children"]]
        meshes = {o["meshes"][k["mesh"]]["name"].split("-")[0] for k in kids}
        assert meshes == {"anel", "cil", "cubo"}, f["name"]   # moldura, cubo, pás
        assert len(kids) == 2 + 7


def test_ring_colour_says_intake_exhaust_simulated():
    o = build_gltf(_est())
    mat = {i: m["name"] for i, m in enumerate(o["materials"])}

    def ring_mat(name):
        f = next(n for n in o["nodes"] if n.get("name") == name)
        ring = next(o["nodes"][i] for i in f["children"] if o["meshes"][o["nodes"][i]["mesh"]]["name"].startswith("anel"))
        return mat[o["meshes"][ring["mesh"]]["primitives"][0]["material"]]

    assert ring_mat("fan-front_bottom-0") == "fresh"
    assert ring_mat("fan-top_bay-0") == "accent"      # simulada
    assert ring_mat("gpu-fan-0") == "line"
