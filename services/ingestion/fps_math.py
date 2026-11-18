"""Média de FPS entre jogos — UMA definição para a API inteira.

Média GEOMÉTRICA, não aritmética: o FPS de jogos diferentes vive em escalas
diferentes (Valorant e CS2 na casa das centenas, Fortnite e GTA V nas
dezenas). Numa média aritmética os eSports dominam o número e o custo/FPS
passa a medir "quanto custa um FPS de Valorant". A geométrica dá o mesmo peso
a cada jogo — é também o que o Tom's Hardware usa no agregado de 11 jogos de
onde vem o ``fps_1080p_agg``, e o que o site usa (apps/web/src/lib/metrics.ts).
"""
from __future__ import annotations

import math
from typing import Iterable


def geomean(values: Iterable[float]) -> float:
    """Média geométrica dos valores > 0; 0.0 se não houver nenhum."""
    vals = [float(v) for v in values if v and v > 0]
    if not vals:
        return 0.0
    return math.exp(sum(math.log(v) for v in vals) / len(vals))
