"""Revisão do ingestor de modelos — folha de contacto (gerado vs tier).

Endpoints internos para o founder rever, num lugar só, todos os descritores de
aparência e aprová-los em lote. NADA aqui gera nem altera descritor — só LISTA e
comuta o portão de aprovação (reviewed_at). A geração/validação continua no
`seed.ingest_visuals`, que é o caminho auditado.

SEGURANÇA: gated por um segredo partilhado em ``VISUALS_REVIEW_TOKEN``. Sem a
variável de ambiente, os endpoints respondem 404 (desligados por omissão) — não
há como abrir a folha de revisão sem o operador ter configurado o segredo.
"""
from __future__ import annotations

import hmac
import json
import os
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db

router = APIRouter(tags=["visuals"])


def _check_token(token: Optional[str]) -> None:
    """Portão de acesso. Segredo ausente => recurso inexistente (404)."""
    secret = os.environ.get("VISUALS_REVIEW_TOKEN")
    if not secret:
        raise HTTPException(status_code=404, detail="not found")
    if not token or not hmac.compare_digest(token, secret):
        # 404 (não 401/403) para não confirmar a existência da folha
        raise HTTPException(status_code=404, detail="not found")


class ReviewRow(BaseModel):
    product_id: int
    sku: str
    name: str
    category: str          # categoria canónica do descritor (case -> case_front)
    catalog_category: str  # categoria do catálogo (para o tier/pickVariant)
    descriptor: dict
    source: str
    confidence: float
    reviewed: bool
    specs: dict


class ReviewList(BaseModel):
    total: int
    approved: int
    pending: int
    rows: List[ReviewRow]


class ReviewAction(BaseModel):
    action: Literal["approve", "revoke"]
    skus: List[str]


@router.get("/review", response_model=ReviewList)
async def list_review(
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ReviewList:
    _check_token(token)
    rows = (await db.execute(text(
        "SELECT v.product_id, p.sku, p.name, v.category, p.category AS cat, "
        "       v.descriptor, v.source, v.confidence, "
        "       (v.reviewed_at IS NOT NULL) AS reviewed, p.specs "
        "FROM product_visuals v JOIN products p ON p.id = v.product_id "
        "ORDER BY v.category, (v.reviewed_at IS NOT NULL), p.name"
    ))).all()
    out: List[ReviewRow] = []
    approved = 0
    for r in rows:
        desc = r.descriptor
        if isinstance(desc, str):
            try:
                desc = json.loads(desc)
            except (ValueError, TypeError):
                continue
        specs = r.specs
        if isinstance(specs, str):
            try:
                specs = json.loads(specs)
            except (ValueError, TypeError):
                specs = {}
        approved += 1 if r.reviewed else 0
        out.append(ReviewRow(
            product_id=r.product_id, sku=r.sku, name=r.name,
            category=str(r.category), catalog_category=str(r.cat),
            descriptor=desc or {}, source=r.source,
            confidence=float(r.confidence or 0), reviewed=bool(r.reviewed),
            specs=specs or {},
        ))
    return ReviewList(total=len(out), approved=approved,
                      pending=len(out) - approved, rows=out)


@router.post("/review")
async def act_review(
    body: ReviewAction,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    _check_token(token)
    if not body.skus:
        raise HTTPException(status_code=400, detail="skus vazio")
    who = os.environ.get("VISUALS_REVIEW_BY", "revisor-web")
    if body.action == "approve":
        sql = ("UPDATE product_visuals v SET reviewed_at = now(), reviewed_by = :by "
               "FROM products p WHERE p.id = v.product_id AND p.sku = ANY(:skus)")
        params = {"by": who, "skus": body.skus}
    else:  # revoke
        sql = ("UPDATE product_visuals v SET reviewed_at = NULL, reviewed_by = NULL "
               "FROM products p WHERE p.id = v.product_id AND p.sku = ANY(:skus)")
        params = {"skus": body.skus}
    res = await db.execute(text(sql), params)
    await db.commit()
    return {"action": body.action, "affected": res.rowcount}
