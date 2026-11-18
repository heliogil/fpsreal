"""Faixas de orçamento do Rei do FPS — fonte única no lado da API.

A chave (`r3k`…) é interna e fica nas URLs (`/build/rei-r3k`) — não muda, para
não quebrar links. O que muda é o que a faixa PROMETE: até 2026-11-18 chamava-se
"R$ 3k" uma build de R$ 4.010. Agora o rótulo é o teto real.

Regra do Rei de cada faixa (seed/crown_reis.py): o MÁXIMO de FPS médio em 1080p
(média geométrica dos jogos de referência) com preço total ≤ teto, sem erro nem
aviso de compatibilidade, fluxo de ar ≥ MIN_AIRFLOW e só com CPUs calibradas.
Empate de FPS → a mais barata. O custo/FPS continua a ser a métrica que elege o
Rei ENTRE faixas (home, og:image).

O site (apps/web/src/lib/tiers.ts) repete os rótulos — manter os dois iguais.
"""
from __future__ import annotations

from typing import NamedTuple, Optional


class Tier(NamedTuple):
    key: str
    label: str          # "até R$ 4,5k"
    rei_name: str       # "Rei até R$ 4,5k"
    floor_brl: float    # o Rei tem de custar MAIS que isto (0 = sem piso)
    cap_brl: Optional[float]  # e no máximo isto (None = sem teto)


TIERS = [
    Tier("r3k", "até R$ 4,5k", "Rei até R$ 4,5k", 0, 4500),
    Tier("r5k", "até R$ 7k", "Rei até R$ 7k", 0, 7000),
    Tier("r8k", "até R$ 11k", "Rei até R$ 11k", 0, 11000),
    # topo: tem de gastar acima do teto da faixa anterior, senão é a mesma build
    Tier("r12k_plus", "R$ 11k+", "Rei dos R$ 11k+", 11000, None),
]
TIER_BY_KEY = {t.key: t for t in TIERS}

MIN_AIRFLOW = 70
RANK_RESOLUTION = "1080p"
RANK_GAMES = ["valorant", "cs2", "fortnite", "gta-v"]  # = web lib/metrics.ts REFERENCE_GAMES
