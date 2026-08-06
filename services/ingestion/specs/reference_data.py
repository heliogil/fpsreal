"""Tabela curada de socket/RAM — fatos de engenharia, não estimativa.

Socket e tipo de memória são fixados no LANÇAMENTO da geração/chipset e não
mudam depois — não há "atualização" real a fazer aqui, só cobertura a
estender quando uma geração nova sai. Por isso isto é uma tabela versionada
(``REFERENCE_DATE``), não um scraper: a fonte é a especificação oficial
publicada pela AMD/Intel, não uma leitura ao vivo de terceiro.

DUAS TABELAS COM CONFIABILIDADE DIFERENTE:

  - ``CPU_SOCKET`` — soquete por CPU. Baixa ambiguidade: nenhum modelo de CPU
    sai em dois soquetes. Uma fonte curada basta.

  - ``CHIPSET_SPECS`` — soquete + tipo de RAM por CHIPSET. Nos chipsets AMD
    isto é inequívoco (o soquete já fixa o tipo: AM4=DDR4, AM5=DDR5). Nos
    chipsets Intel LGA1700 (Z790/B760/H770/etc.) **isto é AMBÍGUO por
    natureza** — a Intel permite placas DDR4 E DDR5 no mesmo chipset, e só o
    MODELO da placa desambigua (ex.: catálogo já tem "Gigabyte B760 Gaming X
    DDR5" — o "DDR5" está no NOME porque o chipset sozinho não decide).
    ``ram_type=None`` marca essa ambiguidade explicitamente: o adapter que
    consome isto TEM de tentar o nome do produto antes de aceitar, e cair em
    conflito (nunca escolher DDR4 ou DDR5 no palpite) se o nome também não
    disser.

Fonte: especificações oficiais de soquete/memória da AMD (am4/am5) e Intel
(chipset datasheets 400/500/600/700/800-series), compiladas nesta data.
"""
from __future__ import annotations

REFERENCE_DATE = "2026-08-06"
REFERENCE_SOURCE_NAME = "amd_intel_chipset_reference"
REFERENCE_SOURCE_NOTE = (
    "Soquete/RAM oficial por geração/chipset, compilado de especificações "
    "públicas AMD/Intel — não é leitura ao vivo de um site de terceiro."
)

# ── CPU → socket ──────────────────────────────────────────────────────────
# Chave: SKU do catálogo OU o nome do modelo (fallback por substring, ver
# reference_adapter.py). Não exaustivo por design — cobre as gerações comuns
# de PC gamer BR; modelo ausente cai no LLM fallback / fila de conflito,
# nunca em palpite.
CPU_SOCKET: dict[str, str] = {
    # AMD AM5 (Ryzen 7000/9000) — DDR5 only
    "ryzen 9 9950x3d": "AM5", "ryzen 9 9950x": "AM5", "ryzen 9 9900x": "AM5",
    "ryzen 7 9800x3d": "AM5", "ryzen 7 9700x": "AM5",
    "ryzen 5 9600x": "AM5",
    "ryzen 9 7950x3d": "AM5", "ryzen 9 7950x": "AM5", "ryzen 9 7900x": "AM5",
    "ryzen 7 7800x3d": "AM5", "ryzen 7 7700x": "AM5", "ryzen 7 7700": "AM5",
    "ryzen 5 7600x": "AM5", "ryzen 5 7600": "AM5",
    # AMD AM4 (Ryzen 1000–5000) — DDR4 only
    "ryzen 9 5950x": "AM4", "ryzen 9 5900x": "AM4",
    "ryzen 7 5800x3d": "AM4", "ryzen 7 5800x": "AM4", "ryzen 7 5700x": "AM4", "ryzen 7 5700": "AM4",
    "ryzen 5 5600x": "AM4", "ryzen 5 5600": "AM4", "ryzen 5 5500": "AM4",
    "ryzen 7 3700x": "AM4", "ryzen 5 3600": "AM4",
    # Intel LGA1851 (Core Ultra 200S / Arrow Lake) — DDR5 only
    "core ultra 9 285k": "LGA1851", "core ultra 7 265k": "LGA1851", "core ultra 5 245k": "LGA1851",
    # Intel LGA1700 (12ª–14ª geração) — DDR4 OU DDR5, decide a PLACA
    "i9-14900k": "LGA1700", "i9-13900k": "LGA1700",
    "i7-14700k": "LGA1700", "i7-13700k": "LGA1700",
    "i5-14600kf": "LGA1700", "i5-14600k": "LGA1700",
    "i5-13600kf": "LGA1700", "i5-13600k": "LGA1700", "i5-13400f": "LGA1700", "i5-13400": "LGA1700",
    "i5-12600kf": "LGA1700", "i5-12400f": "LGA1700", "i5-12400": "LGA1700",
    # Intel LGA1200 (10ª–11ª geração) — DDR4 only
    "i9-11900k": "LGA1200", "i7-11700k": "LGA1200",
    "i5-11600k": "LGA1200", "i5-10600k": "LGA1200", "i5-10400f": "LGA1200", "i5-10400": "LGA1200",
}

# ── chipset → (socket, ram_type | None) ──────────────────────────────────
# ram_type=None ⇒ AMBÍGUO por chipset sozinho (só chipsets Intel 600/700
# series). O adapter DEVE tentar desambiguar pelo nome do produto e, se
# falhar, gerar spec_conflicts — nunca decide sozinho.
CHIPSET_SPECS: dict[str, dict] = {
    # AMD AM5 — sempre DDR5
    "x870e": {"socket": "AM5", "ram_type": "DDR5"},
    "x870":  {"socket": "AM5", "ram_type": "DDR5"},
    "x670e": {"socket": "AM5", "ram_type": "DDR5"},
    "x670":  {"socket": "AM5", "ram_type": "DDR5"},
    "b850":  {"socket": "AM5", "ram_type": "DDR5"},
    "b650e": {"socket": "AM5", "ram_type": "DDR5"},
    "b650":  {"socket": "AM5", "ram_type": "DDR5"},
    "a620":  {"socket": "AM5", "ram_type": "DDR5"},
    # AMD AM4 — sempre DDR4
    "x570":  {"socket": "AM4", "ram_type": "DDR4"},
    "x470":  {"socket": "AM4", "ram_type": "DDR4"},
    "b550":  {"socket": "AM4", "ram_type": "DDR4"},
    "b450":  {"socket": "AM4", "ram_type": "DDR4"},
    "a520":  {"socket": "AM4", "ram_type": "DDR4"},
    # Intel LGA1851 — sempre DDR5
    "z890":  {"socket": "LGA1851", "ram_type": "DDR5"},
    "b860":  {"socket": "LGA1851", "ram_type": "DDR5"},
    "h810":  {"socket": "LGA1851", "ram_type": "DDR5"},
    # Intel LGA1700 — AMBÍGUO: a Intel permite variantes DDR4 e DDR5 do
    # mesmo chipset (ex.: existe "B760 DDR4" e "B760 DDR5" no mercado).
    "z790":  {"socket": "LGA1700", "ram_type": None},
    "z690":  {"socket": "LGA1700", "ram_type": None},
    "h770":  {"socket": "LGA1700", "ram_type": None},
    "b760":  {"socket": "LGA1700", "ram_type": None},
    "h670":  {"socket": "LGA1700", "ram_type": None},
    "b660":  {"socket": "LGA1700", "ram_type": None},
    "h610":  {"socket": "LGA1700", "ram_type": None},
    # Intel LGA1200 — sempre DDR4 (não existiu variante DDR5 neste soquete)
    "z590":  {"socket": "LGA1200", "ram_type": "DDR4"},
    "z490":  {"socket": "LGA1200", "ram_type": "DDR4"},
    "h570":  {"socket": "LGA1200", "ram_type": "DDR4"},
    "b560":  {"socket": "LGA1200", "ram_type": "DDR4"},
    "h470":  {"socket": "LGA1200", "ram_type": "DDR4"},
    "b460":  {"socket": "LGA1200", "ram_type": "DDR4"},
}
