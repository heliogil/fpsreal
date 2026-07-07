"""SQLAlchemy 2.0 async engine and session factory.

The connection URL is read from the ``DATABASE_URL`` environment variable.
``postgresql://`` is rewritten to ``postgresql+asyncpg://`` so the standard
DATABASE_URL (psycopg-style) works with asyncpg without extra config.
"""
from __future__ import annotations

import os
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


def _build_dsn() -> str:
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        raise RuntimeError(
            "DATABASE_URL is not set. The ingestion service requires a "
            "postgresql:// connection string (e.g. "
            "postgresql://pcb_user:***@localhost:5434/pcb_db)."
        )
    if raw.startswith("postgresql://"):
        return raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    if raw.startswith("postgresql+asyncpg://"):
        return raw
    # Allow pre-built driver URL (e.g. postgresql+psycopg://).
    if raw.startswith("postgresql+") and "://" in raw:
        return raw
    raise RuntimeError(
        f"Unsupported DATABASE_URL scheme: {raw[:32]!r}. Expected postgresql://"
    )


DATABASE_URL: str = _build_dsn()

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models in the ingestion service."""


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency that yields an AsyncSession and closes it cleanly."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
