"""Revisão de conflitos de especificação — fila de socket/RAM não confirmados.

Mesmo padrão do routers/visuals.py: NADA aqui gera observação nem resolve
sozinho — só LISTA os conflitos abertos (spec_conflicts.resolved_at IS NULL)
e deixa o operador resolver. A geração/reconciliação continua em
``seed.ingest_specs``, que é o caminho auditado.

SEGURANÇA: gated por segredo em ``SPECS_REVIEW_TOKEN``. Sem a variável de
ambiente, os endpoints respondem 404 — mesmo tratamento do gate de visuals.
"""
from __future__ import annotations

import hmac
import json
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db

router = APIRouter(tags=["specs"])


def _check_token(token: Optional[str]) -> None:
    secret = os.environ.get("SPECS_REVIEW_TOKEN")
    if not secret:
        raise HTTPException(status_code=404, detail="not found")
    if not token or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=404, detail="not found")


class ConflictRow(BaseModel):
    sku: str
    name: str
    attribute: str
    candidates: list
    reason: str
    detected_at: str


class ConflictList(BaseModel):
    total: int
    rows: List[ConflictRow]


class ResolveAction(BaseModel):
    sku: str
    attribute: str
    value: str


@router.get("/conflicts", response_model=ConflictList)
async def list_conflicts(
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ConflictList:
    _check_token(token)
    rows = (await db.execute(text(
        """
        SELECT p.sku, p.name, c.attribute, c.candidates, c.reason, c.detected_at
        FROM spec_conflicts c JOIN products p ON p.id = c.product_id
        WHERE c.resolved_at IS NULL
        ORDER BY p.sku, c.attribute
        """
    ))).mappings().all()
    return ConflictList(
        total=len(rows),
        rows=[
            ConflictRow(
                sku=r["sku"], name=r["name"], attribute=r["attribute"],
                candidates=r["candidates"], reason=r["reason"] or "",
                detected_at=r["detected_at"].isoformat(),
            )
            for r in rows
        ],
    )


_VALID_VALUES = {
    "socket": {"AM4", "AM5", "LGA1200", "LGA1700", "LGA1851"},
    "ram_type": {"DDR4", "DDR5"},
}


@router.post("/resolve")
async def resolve_conflict(
    body: ResolveAction,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    _check_token(token)
    valid = _VALID_VALUES.get(body.attribute)
    if valid is None:
        raise HTTPException(status_code=422, detail=f"atributo desconhecido: {body.attribute!r}")
    if body.value not in valid:
        raise HTTPException(status_code=422, detail=f"valor inválido: {sorted(valid)}")

    row = (await db.execute(
        text("SELECT id FROM products WHERE sku = :sku"), {"sku": body.sku}
    )).first()
    if row is None:
        raise HTTPException(status_code=404, detail="SKU não encontrado")
    pid = row[0]

    patch = json.dumps({body.attribute: body.value})
    await db.execute(
        text("UPDATE products SET specs = specs || CAST(:patch AS jsonb), updated_at = now() "
             "WHERE id = :pid"),
        {"patch": patch, "pid": pid},
    )
    await db.execute(
        text("UPDATE spec_conflicts SET resolved_at = now(), resolved_value = :value, "
             "resolved_by = 'web' WHERE product_id = :pid AND attribute = :attribute"),
        {"value": body.value, "pid": pid, "attribute": body.attribute},
    )
    await db.commit()
    return {"ok": True}
