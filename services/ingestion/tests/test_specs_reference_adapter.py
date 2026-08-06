"""Testes unitários do ReferenceAdapter — sem DB, sem HTTP.

Os casos de CPU/placa cruzam com o catálogo REAL já semeado
(``seed/catalog_data.py``) para provar que a tabela curada concorda com o
que já se sabia estar certo. O caso "Gigabyte B760 Gaming X DDR5" é real —
é o produto já semeado no catálogo, e é exatamente o exemplo de ambiguidade
Intel que motivou este desenho.
"""
from __future__ import annotations

from specs.reference_adapter import ReferenceAdapter

adapter = ReferenceAdapter()


def _cpu(sku, name):
    return {"sku": sku, "name": name, "category": "cpu", "specs": {}}


def _mobo(sku, name):
    return {"sku": sku, "name": name, "category": "motherboard", "specs": {}}


def _by_attr(observations, attribute):
    return next((o for o in observations if o.attribute == attribute), None)


# ── CPU — cruza com catalog_data.py (fatos já conhecidos) ─────────────────

def test_amd_am5_cpu_socket():
    obs = adapter.fetch(_cpu("cpu-r7-9800x3d", "Ryzen 7 9800X3D"))
    socket = _by_attr(obs, "socket")
    assert socket is not None
    assert socket.value == "AM5"
    assert socket.confidence == 1.0


def test_amd_am4_cpu_socket():
    obs = adapter.fetch(_cpu("cpu-r5-5600", "Ryzen 5 5600"))
    assert _by_attr(obs, "socket").value == "AM4"


def test_intel_lga1700_cpu_socket():
    obs = adapter.fetch(_cpu("cpu-i5-14600kf", "Core i5-14600KF"))
    assert _by_attr(obs, "socket").value == "LGA1700"


def test_intel_lga1700_cpu_socket_does_not_confuse_similar_model():
    # 13400 vs 13400f — o match mais longo tem de vencer
    obs = adapter.fetch(_cpu("cpu-i5-13400f", "Core i5-13400F"))
    assert _by_attr(obs, "socket").value == "LGA1700"


def test_unknown_cpu_model_returns_nothing_not_a_guess():
    obs = adapter.fetch(_cpu("cpu-future", "Ryzen 99 99999X9D"))
    assert obs == []


# ── Motherboard — chipset AMD é inequívoco ─────────────────────────────────

def test_amd_b650_motherboard_socket_and_ram():
    obs = adapter.fetch(_mobo("mb-b650-tuf", "ASUS TUF Gaming B650-PLUS"))
    socket, ram = _by_attr(obs, "socket"), _by_attr(obs, "ram_type")
    assert socket.value == "AM5" and socket.confidence == 1.0
    assert ram.value == "DDR5" and ram.confidence == 1.0


def test_amd_b550_motherboard_is_ddr4():
    obs = adapter.fetch(_mobo("mb-b550-steel", "ASRock B550 Steel Legend"))
    assert _by_attr(obs, "socket").value == "AM4"
    assert _by_attr(obs, "ram_type").value == "DDR4"


# ── Motherboard — chipset Intel 700-series é AMBÍGUO por natureza ─────────

def test_intel_b760_with_ddr5_in_name_disambiguates():
    # produto real do catálogo semeado — o "DDR5" está no nome porque o
    # chipset sozinho não decide
    obs = adapter.fetch(_mobo("mb-b760-gaming-x", "Gigabyte B760 Gaming X DDR5"))
    socket, ram = _by_attr(obs, "socket"), _by_attr(obs, "ram_type")
    assert socket.value == "LGA1700" and socket.confidence == 1.0
    assert ram.value == "DDR5"
    assert ram.confidence == 0.9   # desambiguado pelo nome, não pelo chipset


def test_intel_b760_without_ddr_marker_never_guesses():
    obs = adapter.fetch(_mobo("mb-b760-generic", "Gigabyte B760M DS3H"))
    ram = _by_attr(obs, "ram_type")
    assert ram is not None
    assert ram.confidence == 0.0
    assert ram.value == "AMBIGUOUS"   # sentinela — reconcile() trata como conflito, nunca escolhe


def test_unknown_chipset_returns_nothing():
    obs = adapter.fetch(_mobo("mb-future", "ASUS ROG Strix Z999"))
    assert obs == []
