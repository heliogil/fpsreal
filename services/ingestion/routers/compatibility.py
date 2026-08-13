"""Compatibility check endpoint — price-independent build validation.

POST /compatibility/check  {"components": {"cpu_id": .., "gpu_id": .., ...}}

Fina camada HTTP sobre ``compat_core.evaluate()`` — carrega os produtos e as
regras ativas do banco, converte para o formato que o núcleo espera e devolve
a resposta. Toda a lógica de comparação vive em ``compat_core.py`` agora
(2026-08-12), porque o wizard também precisa dela — ver o docstring de lá.

Response matches the web contract (``api.ts`` LiveCompatibilityRepo):
    { errors: string[], warnings: string[],
      clearances: { <slot>: {remaining_mm, is_tight} },
      airflow: BuildAirflowZoneState[] }
"""
from __future__ import annotations

from typing import Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from compat_core import Part, evaluate
from deps import get_db
from models import CompatibilityRule, Product

router = APIRouter(tags=["compatibility"])


class CheckRequest(BaseModel):
    components: Dict[str, Optional[int]]


def _category_from_key(key: str) -> str:
    # "cpu_id" -> "cpu"
    return key[:-3] if key.endswith("_id") else key


@router.post("/check", response_model=None)
async def check_build(body: CheckRequest, db: AsyncSession = Depends(get_db)):
    # Load selected products, keyed by category
    ids = [v for v in body.components.values() if v]
    by_cat: Dict[str, Part] = {}
    if ids:
        rows = (await db.execute(select(Product).where(Product.id.in_(ids)))).scalars().all()
        prod_by_id = {p.id: p for p in rows}
        for key, pid in body.components.items():
            if pid and pid in prod_by_id:
                p = prod_by_id[pid]
                by_cat[_category_from_key(key)] = Part(name=p.name, specs=p.specs or {})

    rules = (
        await db.execute(select(CompatibilityRule).where(CompatibilityRule.is_active.is_(True)))
    ).scalars().all()

    result = evaluate(by_cat, rules)
    # Airflow scoring is a later sprint → returned empty for now (honest: we
    # don't claim an airflow verdict we haven't computed).
    result["airflow"] = []
    return result
