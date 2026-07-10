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

    # CORS — local Next.js dev (port 3100). Additional origins can be added
    # via the comma-separated CORS_ALLOW_ORIGINS env var.
    allow_origins_env = os.environ.get("CORS_ALLOW_ORIGINS", "")
    allow_origins = [
        o.strip() for o in allow_origins_env.split(",") if o.strip()
    ] or ["http://localhost:3100"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers — imported here so module-level errors surface as ImportError
    # during app construction rather than at first request.
    from routers import (
        builds, compatibility, fps, go, health, interior, offers, products,
        track, upgrade, wizard,
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

    @app.get("/", tags=["meta"])
    async def root() -> dict:
        return {
            "service": "Rei do FPS — Ingestion API",
            "version": "0.1.0",
            "docs": "/docs",
        }

    return app


app = create_app()
