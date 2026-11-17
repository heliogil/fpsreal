"""add price_observations

Price *observations* are internal monitoring notes about what a public search
page displayed. They are deliberately NOT ``offers``: the adapter contract in
``adapters/base.py`` reserves offers for honest, named sources, and
``adapters/kabum.py`` requires the official affiliate feed rather than
scraping. Keeping observations in their own table means the comparator can
never render a scraped number as a store price.

Revision ID: d41c9f2a6b83
Revises: b1f4a9d02c17
"""
from alembic import op
import sqlalchemy as sa

revision = "d41c9f2a6b83"
down_revision = "b1f4a9d02c17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "price_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(),
                  sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("observed_name", sa.Text(), nullable=False),
        sa.Column("price_brl", sa.Numeric(12, 2), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_price_observations_product_time",
                    "price_observations", ["product_id", "observed_at"])


def downgrade() -> None:
    op.drop_index("ix_price_observations_product_time",
                  table_name="price_observations")
    op.drop_table("price_observations")
