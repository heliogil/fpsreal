"""FastAPI dependencies."""
from __future__ import annotations

from typing import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal


async def get_db() -> AsyncIterator[AsyncSession]:
    """Yield a database session and close it afterwards.

    Imported as ``get_db`` so routers can use ``Depends(get_db)``.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


__all__ = ["get_db", "Depends"]
