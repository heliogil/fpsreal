"""Routers for the Rei do FPS ingestion API.

Each module exposes a ``router`` (``APIRouter``) that the application
imports and mounts in ``main.py``.
"""
from routers import builds, go, health, products, wizard

__all__ = ["health", "products", "builds", "wizard", "go"]
