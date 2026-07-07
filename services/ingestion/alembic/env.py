"""Alembic env — async-aware.

Pulls the connection URL from the ``DATABASE_URL`` env var and converts
it to the asyncpg variant before constructing the engine. Migrations
themselves are run in sync mode against a synchronous engine, which is
what Alembic natively supports.
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from alembic.config import Config
from sqlalchemy import engine_from_config, pool

# Make the service package importable when Alembic is run from the
# service root (e.g. ``alembic upgrade head`` inside the container).
# We add the directory that contains the service modules (one level up
# from this file, i.e. /app inside the container) so that ``database``,
# ``models`` etc. resolve as top-level modules — matching how the
# application imports them.
sys.path.insert(
    0,
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
)

from database import Base  # noqa: E402
from models import ALL_MODELS  # noqa: E402,F401

# Build a Config from the alembic.ini next to this file. We do this
# explicitly so we have a Config instance regardless of whether
# ``alembic.context.config`` is exposed module-level (it is not on
# Alembic >= 1.16).
_INI_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "alembic.ini")
config = Config(os.path.abspath(_INI_PATH))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _build_sync_url() -> str:
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        raise RuntimeError("DATABASE_URL is not set; cannot run Alembic.")
    if raw.startswith("postgresql+asyncpg://"):
        return raw.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    return raw


config.set_main_option("sqlalchemy.url", _build_sync_url())

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emits SQL without a DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
