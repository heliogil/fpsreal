"""SQLAlchemy 2.0 ORM models for the 17 tables in ``db/schema.sql``.

Conventions:
- All models use ``Mapped[...]`` + ``mapped_column(...)`` (SQLAlchemy 2.0).
- Timezone-aware datetimes use ``TIMESTAMPTZ`` (``DateTime(timezone=True)``).
- Enumerated CHECK constraints are reflected in Python as ``str`` columns
  with the allowed values documented in the column comment / docstring.
- Numeric columns use ``Numeric`` to preserve BRL cents.
- JSONB columns use ``JSONB`` from ``sqlalchemy.dialects.postgresql``.

The relationships below mirror the foreign keys in the schema. They are not
declared as back_populates in a few places to keep the model simple —
callers that need bidirectional navigation can extend them later.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ======================================================================
# CATALOG (5 tables)
# ======================================================================


class Product(Base):
    """A canonical product (CPU, GPU, RAM, etc.) in the catalog.

    Each product can have many ``Variant`` rows (colour, capacity, etc.)
    and many ``PerformanceIndex`` entries.
    """

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Allowed: cpu, gpu, ram, motherboard, storage, psu, case, cooler, fan
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(String(100))
    specs: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    variants: Mapped[List["Variant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    performance_entries: Mapped[List["PerformanceIndex"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    footprint: Mapped[Optional["ComponentFootprint"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        uselist=False,
    )

    __table_args__ = (
        CheckConstraint(
            "category IN ('cpu','gpu','ram','motherboard','storage',"
            "'psu','case','cooler','fan')",
            name="products_category_check",
        ),
    )


class Variant(Base):
    """A buyable variant of a product (e.g. 16GB vs 32GB of the same RAM)."""

    __tablename__ = "variants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    variant_name: Mapped[Optional[str]] = mapped_column(String(255))
    ean: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    product: Mapped[Product] = relationship(back_populates="variants")
    offers: Mapped[List["Offer"]] = relationship(
        back_populates="variant", cascade="all, delete-orphan"
    )


class Merchant(Base):
    """A partner store. Seeded via schema.sql with the four BR retailers."""

    __tablename__ = "merchants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    affiliate_base_url: Mapped[Optional[str]] = mapped_column(Text)
    # Allowed: api, feed, scraper
    data_source: Mapped[Optional[str]] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    offers: Mapped[List["Offer"]] = relationship(back_populates="merchant")

    __table_args__ = (
        CheckConstraint(
            "data_source IN ('api','feed','scraper')",
            name="merchants_data_source_check",
        ),
    )


class Offer(Base):
    """A specific (variant × merchant) listing with current price."""

    __tablename__ = "offers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("variants.id", ondelete="CASCADE"), nullable=False
    )
    merchant_id: Mapped[int] = mapped_column(
        ForeignKey("merchants.id"), nullable=False
    )
    external_id: Mapped[Optional[str]] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(Text, nullable=False)
    price_brl: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    affiliate_url: Mapped[Optional[str]] = mapped_column(Text)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    variant: Mapped[Variant] = relationship(back_populates="offers")
    merchant: Mapped[Merchant] = relationship(back_populates="offers")
    price_history: Mapped[List["PriceHistory"]] = relationship(
        back_populates="offer", cascade="all, delete-orphan"
    )
    clicks: Mapped[List["AffiliateClick"]] = relationship(
        back_populates="offer", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("variant_id", "merchant_id", name="offers_variant_merchant_key"),
    )


class PriceHistory(Base):
    """A historical price snapshot. Append-only."""

    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    offer_id: Mapped[int] = mapped_column(
        ForeignKey("offers.id", ondelete="CASCADE"), nullable=False
    )
    price_brl: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    offer: Mapped[Offer] = relationship(back_populates="price_history")


# ======================================================================
# PERFORMANCE ENGINE (2 tables)
# ======================================================================


class PerformanceIndex(Base):
    """A normalised performance index for a product (anchor+scale method)."""

    __tablename__ = "performance_index"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    # Allowed: gaming_1080p, gaming_1440p, gaming_4k, rendering, compute
    benchmark_type: Mapped[str] = mapped_column(String(50), nullable=False)
    index_value: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    anchor_product_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("products.id")
    )
    source: Mapped[Optional[str]] = mapped_column(String(255))
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    source_date: Mapped[Optional[date]] = mapped_column(Date)
    confidence: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(3, 2), default=Decimal("0.80")
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    product: Mapped[Product] = relationship(back_populates="performance_entries")

    __table_args__ = (
        UniqueConstraint(
            "product_id", "benchmark_type", name="performance_index_product_benchmark_key"
        ),
        CheckConstraint(
            "benchmark_type IN ('gaming_1080p','gaming_1440p','gaming_4k',"
            "'rendering','compute')",
            name="performance_index_benchmark_type_check",
        ),
        CheckConstraint(
            "confidence BETWEEN 0 AND 1", name="performance_index_confidence_check"
        ),
    )


class FpsEstimate(Base):
    """An estimated FPS figure for a CPU+GPU pair on a given game+preset.

    Crucially, the ``method`` column is required at the application level:
    the API never claims these are measured — they are
    ``anchor_scale_estimate`` figures.
    """

    __tablename__ = "fps_estimates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cpu_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    gpu_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    game_slug: Mapped[str] = mapped_column(String(100), nullable=False)
    # Allowed: 1080p, 1440p, 4k
    resolution: Mapped[str] = mapped_column(String(20), nullable=False)
    # Allowed: low, medium, high, ultra
    preset: Mapped[Optional[str]] = mapped_column(String(20))
    fps_estimate: Mapped[Decimal] = mapped_column(Numeric(6, 1), nullable=False)
    fps_low_1pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 1))
    confidence_band_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 1))
    method: Mapped[Optional[str]] = mapped_column(
        String(50), default="anchor_scale"
    )
    sources: Mapped[Optional[list]] = mapped_column(JSONB)
    is_crowdsourced: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "cpu_id",
            "gpu_id",
            "game_slug",
            "resolution",
            "preset",
            name="fps_estimates_cpu_gpu_game_res_preset_key",
        ),
        CheckConstraint(
            "resolution IN ('1080p','1440p','4k')",
            name="fps_estimates_resolution_check",
        ),
        CheckConstraint(
            "preset IN ('low','medium','high','ultra')",
            name="fps_estimates_preset_check",
        ),
    )


# ======================================================================
# COMPATIBILITY ENGINE (2 tables)
# ======================================================================


class CompatibilityRule(Base):
    """A categorical compatibility rule between two component attributes."""

    __tablename__ = "compatibility_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    category_a: Mapped[str] = mapped_column(String(50), nullable=False)
    attribute_a: Mapped[str] = mapped_column(String(100), nullable=False)
    # Allowed: equals, gte, lte, in, not_in
    operator: Mapped[str] = mapped_column(String(20), nullable=False)
    category_b: Mapped[str] = mapped_column(String(50), nullable=False)
    attribute_b: Mapped[str] = mapped_column(String(100), nullable=False)
    # Allowed: error, warning, info
    severity: Mapped[Optional[str]] = mapped_column(String(20), default="error")
    message_template: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        CheckConstraint(
            "operator IN ('equals','gte','lte','in','not_in')",
            name="compatibility_rules_operator_check",
        ),
        CheckConstraint(
            "severity IN ('error','warning','info')",
            name="compatibility_rules_severity_check",
        ),
    )


class ThermalRule(Base):
    """A TDP-driven rule for matching coolers and cases to a product."""

    __tablename__ = "thermal_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"))
    tdp_min_w: Mapped[Optional[int]] = mapped_column(Integer)
    tdp_max_w: Mapped[Optional[int]] = mapped_column(Integer)
    # Allowed: stock, tower_65w, tower_125w, aio_240, aio_360
    min_cooler_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Allowed: passive, low, medium, high
    min_case_airflow: Mapped[Optional[str]] = mapped_column(String(20))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "min_cooler_type IN ('stock','tower_65w','tower_125w','aio_240','aio_360')",
            name="thermal_rules_min_cooler_type_check",
        ),
        CheckConstraint(
            "min_case_airflow IN ('passive','low','medium','high')",
            name="thermal_rules_min_case_airflow_check",
        ),
    )


# ======================================================================
# SLOT MODEL (2 tables)
# ======================================================================


class CaseSlot(Base):
    """A physical slot inside a case (e.g. GPU length, CPU cooler height)."""

    __tablename__ = "case_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    slot_name: Mapped[str] = mapped_column(String(100), nullable=False)
    slot_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Allowed: x, y, z
    axis: Mapped[str] = mapped_column(String(1), nullable=False)
    position_front_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 1))
    position_top_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 1))
    position_right_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 1))
    base_capacity_mm: Mapped[Decimal] = mapped_column(Numeric(6, 1), nullable=False)
    affects_slots: Mapped[Optional[list]] = mapped_column(JSONB, default=list)

    __table_args__ = (
        UniqueConstraint(
            "case_product_id", "slot_name", name="case_slots_case_slot_name_key"
        ),
        CheckConstraint(
            "axis IN ('x','y','z')", name="case_slots_axis_check"
        ),
    )


class ComponentFootprint(Base):
    """Physical dimensions of a component, used to check slot fit."""

    __tablename__ = "component_footprints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"), unique=True, nullable=False
    )
    length_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 1))
    width_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 1))
    height_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 1))
    installed_thickness_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 1))
    slot_type_required: Mapped[Optional[str]] = mapped_column(String(50))
    airflow_zone: Mapped[Optional[str]] = mapped_column(String(50))
    airflow_resistance_factor: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(3, 2), default=Decimal("0.10")
    )
    model_gltf_path: Mapped[Optional[str]] = mapped_column(Text)
    model_generated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    dimensions_source: Mapped[Optional[str]] = mapped_column(
        String(100), default="manufacturer_spec"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    product: Mapped[Product] = relationship(back_populates="footprint")

    __table_args__ = (
        CheckConstraint(
            "airflow_resistance_factor BETWEEN 0 AND 1",
            name="component_footprints_resistance_check",
        ),
    )


# ======================================================================
# AIRFLOW SIMULATION (1 table)
# ======================================================================


class CaseAirflowZone(Base):
    """A node in the case airflow graph (intake, exhaust, internal, dead)."""

    __tablename__ = "case_airflow_zones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    zone_name: Mapped[str] = mapped_column(String(50), nullable=False)
    # Allowed: intake, exhaust, internal, dead
    zone_type: Mapped[Optional[str]] = mapped_column(String(20))
    base_flow_capacity_cfm: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 1))
    connects_to: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    heat_source_slots: Mapped[Optional[list]] = mapped_column(JSONB, default=list)

    __table_args__ = (
        UniqueConstraint(
            "case_product_id", "zone_name", name="case_airflow_zones_case_zone_key"
        ),
        CheckConstraint(
            "zone_type IN ('intake','exhaust','internal','dead')",
            name="case_airflow_zones_zone_type_check",
        ),
    )


# ======================================================================
# CURATED BUILDS + TRACKING (2 tables)
# ======================================================================


class CuratedBuild(Base):
    """A pre-assembled build for a budget tier.

    Only one build per tier should have ``is_rei=True`` at a time — that
    build is the "Rei do FPS" of its tier.
    """

    __tablename__ = "curated_builds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Allowed: r3k, r5k, r8k, r12k_plus
    budget_tier: Mapped[Optional[str]] = mapped_column(String(20))
    is_rei: Mapped[bool] = mapped_column(Boolean, default=False)
    cpu_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"))
    gpu_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"))
    ram_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"))
    motherboard_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"))
    storage_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"))
    psu_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"))
    case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"))
    cooler_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"))
    total_price_brl: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    fps_per_brl: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 4))
    seo_description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    crowned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    dethroned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "budget_tier IN ('r3k','r5k','r8k','r12k_plus')",
            name="curated_builds_budget_tier_check",
        ),
    )


class AffiliateClick(Base):
    """A click on an affiliate link. Used to attribute conversions."""

    __tablename__ = "affiliate_clicks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    offer_id: Mapped[int] = mapped_column(
        ForeignKey("offers.id"), nullable=False
    )
    build_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("curated_builds.id")
    )
    utm_source: Mapped[Optional[str]] = mapped_column(String(100))
    utm_medium: Mapped[Optional[str]] = mapped_column(String(100))
    utm_campaign: Mapped[Optional[str]] = mapped_column(String(100))
    referer: Mapped[Optional[str]] = mapped_column(Text)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64))
    clicked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    offer: Mapped[Offer] = relationship(back_populates="clicks")


# ======================================================================
# BUILD SESSIONS (3 tables)
# ======================================================================


class BuildSession(Base):
    """A wizard session — input, intermediate state, and outputs."""

    __tablename__ = "build_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    # Allowed: new, upgrade
    session_type: Mapped[Optional[str]] = mapped_column(
        String(20), default="new"
    )
    budget_brl: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    games: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    priority: Mapped[Optional[str]] = mapped_column(String(50))
    components: Mapped[dict] = mapped_column(JSONB, default=dict)
    clearances: Mapped[dict] = mapped_column(JSONB, default=dict)
    airflow_state: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    clearances_rows: Mapped[List["BuildClearance"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    airflow_rows: Mapped[List["BuildAirflowState"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "session_type IN ('new','upgrade')",
            name="build_sessions_session_type_check",
        ),
    )


class BuildClearance(Base):
    """Per-slot clearance snapshot within a build session."""

    __tablename__ = "build_clearances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("build_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    slot_name: Mapped[str] = mapped_column(String(100), nullable=False)
    base_capacity_mm: Mapped[Decimal] = mapped_column(Numeric(6, 1), nullable=False)
    used_mm: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(6, 1), default=Decimal("0")
    )
    constraint_sources: Mapped[Optional[list]] = mapped_column(JSONB, default=list)

    session: Mapped[BuildSession] = relationship(back_populates="clearances_rows")

    __table_args__ = (
        UniqueConstraint(
            "session_id", "slot_name", name="build_clearances_session_slot_key"
        ),
    )


class BuildAirflowState(Base):
    """Per-zone airflow state within a build session."""

    __tablename__ = "build_airflow_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("build_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    zone_name: Mapped[str] = mapped_column(String(50), nullable=False)
    source_cfm: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(6, 1), default=Decimal("0")
    )
    exhaust_cfm: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(6, 1), default=Decimal("0")
    )
    effective_flow_cfm: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(6, 1), default=Decimal("0")
    )
    heat_generation_w: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    # Allowed: positive, neutral, negative
    pressure_balance: Mapped[Optional[str]] = mapped_column(String(20))
    airflow_score: Mapped[Optional[int]] = mapped_column(Integer)
    # Allowed: ok, tight, critical, dead_zone
    status: Mapped[Optional[str]] = mapped_column(String(20), default="ok")

    session: Mapped[BuildSession] = relationship(back_populates="airflow_rows")

    __table_args__ = (
        UniqueConstraint(
            "session_id", "zone_name", name="build_airflow_state_session_zone_key"
        ),
        CheckConstraint(
            "airflow_score BETWEEN 0 AND 100",
            name="build_airflow_state_score_check",
        ),
        CheckConstraint(
            "pressure_balance IN ('positive','neutral','negative')",
            name="build_airflow_state_pressure_check",
        ),
        CheckConstraint(
            "status IN ('ok','tight','critical','dead_zone')",
            name="build_airflow_state_status_check",
        ),
    )


# Public model registry — handy for Alembic ``--autogenerate`` and for
# tests that need to iterate every mapped class.
ALL_MODELS = [
    Product,
    Variant,
    Merchant,
    Offer,
    PriceHistory,
    PerformanceIndex,
    FpsEstimate,
    CompatibilityRule,
    ThermalRule,
    CaseSlot,
    ComponentFootprint,
    CaseAirflowZone,
    CuratedBuild,
    AffiliateClick,
    BuildSession,
    BuildClearance,
    BuildAirflowState,
]
