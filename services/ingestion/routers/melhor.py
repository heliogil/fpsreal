"""/melhor — a build com mais FPS para cada orçamento (seed/best_by_budget.py).

GET /melhor/            → lista de orçamentos com build (para o índice e o sitemap)
GET /melhor/{budget}    → a build daquele orçamento (404 se não houver)

Lê budget_picks, gravada pelo cron. Tabela ainda inexistente = lista vazia.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db

router = APIRouter(tags=["melhor"])

_SQL = """
SELECT b.budget_brl, b.components, b.total_brl, b.avg_fps, b.computed_at,
       c.name AS cpu_name, g.name AS gpu_name
FROM budget_picks b
LEFT JOIN products c ON c.id = (b.components->>'cpu_id')::int
LEFT JOIN products g ON g.id = (b.components->>'gpu_id')::int
"""


async def _exists(db: AsyncSession) -> bool:
    return bool((await db.execute(text("SELECT to_regclass('public.budget_picks') IS NOT NULL"))).scalar())


def _row(r) -> dict:
    comps = r.components if isinstance(r.components, dict) else {}
    return {
        "budget_brl": int(r.budget_brl),
        "total_brl": float(r.total_brl),
        "avg_fps": float(r.avg_fps),
        "components": {k: int(v) for k, v in comps.items()},
        "cpu_name": r.cpu_name,
        "gpu_name": r.gpu_name,
        "computed_at": r.computed_at.isoformat() if r.computed_at else None,
    }


@router.get("/")
async def list_budgets(db: AsyncSession = Depends(get_db)) -> list:
    if not await _exists(db):
        return []
    rows = (await db.execute(text(_SQL + " ORDER BY b.budget_brl"))).all()
    return [_row(r) for r in rows]


@router.get("/{budget}")
async def get_budget(budget: int, db: AsyncSession = Depends(get_db)) -> dict:
    if not await _exists(db):
        raise HTTPException(status_code=404, detail="sem dados")
    r = (await db.execute(text(_SQL + " WHERE b.budget_brl = :b"), {"b": budget})).first()
    if r is None:
        raise HTTPException(status_code=404, detail="orçamento sem build")
    return _row(r)
