"""FastAPI app — Rei do FPS Ingestion API.

Mounts routers and configures CORS. The router modules are imported lazily
inside the function to avoid circular imports during testing.
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

log = logging.getLogger("pcb.ingestion")
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))


def create_app() -> FastAPI:
    """Application factory.

    Returning a factory keeps things testable and makes the lifespan /
    middleware order explicit.
    """
    app = FastAPI(
        title="Rei do FPS — Ingestion API",
        version="0.1.0",
        description=(
            "Internal API for ingestion, ranking, and wizard queries. "
            "All FPS figures are anchor+scale estimates; the API never "
            "claims they were measured on hardware."
        ),
    )

    # CORS. In production the web app calls the API same-origin through nginx
    # (/api/), so cross-origin requests only happen in local dev or from tools.
    # The API has no cookie/session auth, so allow_credentials stays False —
    # which is both safer and keeps an explicit (wildcard-free) origin list
    # valid. Extra origins can be added via the CORS_ALLOW_ORIGINS env var
    # (comma-separated).
    default_origins = [
        "http://localhost:3100",
        "https://reidofps.com.br",
        "https://www.reidofps.com.br",
    ]
    allow_origins_env = os.environ.get("CORS_ALLOW_ORIGINS", "")
    allow_origins = [
        o.strip() for o in allow_origins_env.split(",") if o.strip()
    ] or default_origins

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    # Routers — imported here so module-level errors surface as ImportError
    # during app construction rather than at first request.
    from routers import (
        builds, compatibility, fps, go, health, interior, offers, products,
        track, upgrade, vs, wizard,
    )

    app.include_router(health.router)
    app.include_router(products.router, prefix="/products", tags=["products"])
    app.include_router(builds.router, prefix="/builds", tags=["builds"])
    app.include_router(wizard.router, prefix="/wizard", tags=["wizard"])
    app.include_router(fps.router, prefix="/fps", tags=["fps"])
    app.include_router(offers.router, prefix="/offers", tags=["offers"])
    app.include_router(compatibility.router, prefix="/compatibility", tags=["compatibility"])
    app.include_router(interior.router, prefix="/interior", tags=["interior"])
    app.include_router(upgrade.router, prefix="/upgrade", tags=["upgrade"])
    app.include_router(track.router, prefix="/track", tags=["tracking"])
    app.include_router(go.router, prefix="/go", tags=["redirect"])
    app.include_router(vs.router, prefix="/vs", tags=["vs"])

    @app.get("/", tags=["meta"])
    async def root() -> dict:
        return {
            "service": "Rei do FPS — Ingestion API",
            "version": "0.1.0",
            "docs": "/docs",
        }

    return app


app = create_app()
