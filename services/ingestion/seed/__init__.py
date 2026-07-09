"""Rei do FPS — canonical catalog + performance + compatibility seed package.

Run idempotently from ``services/ingestion``:

    python -m seed.run_seed

Reads ``DATABASE_URL`` from the environment. Prices/offers are intentionally
NOT seeded — they come only from official affiliate feeds.
"""
