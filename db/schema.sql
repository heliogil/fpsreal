-- Rei do FPS — pc-builder-br database schema
-- 2026-07-06 — 17 tabelas
-- Grupos: catalog (5) + performance (2) + compatibility (2) + slots (2) + airflow (1) + builds (2) + sessions (3)

SET client_encoding = 'UTF8';

-- ============================================================
-- CATALOG
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    sku         VARCHAR(100) UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    category    VARCHAR(50) NOT NULL CHECK (category IN (
                    'cpu','gpu','ram','motherboard','storage',
                    'psu','case','cooler','fan')),
    brand       VARCHAR(100),
    specs       JSONB DEFAULT '{}',
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS variants (
    id           SERIAL PRIMARY KEY,
    product_id   INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(255),
    ean          VARCHAR(50),
    is_active    BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchants (
    id                 SERIAL PRIMARY KEY,
    slug               VARCHAR(50) UNIQUE NOT NULL,
    name               VARCHAR(100) NOT NULL,
    affiliate_base_url TEXT,
    data_source        VARCHAR(20) CHECK (data_source IN ('api','feed','scraper')),
    is_active          BOOLEAN DEFAULT true,
    last_sync_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS offers (
    id            SERIAL PRIMARY KEY,
    variant_id    INT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    merchant_id   INT NOT NULL REFERENCES merchants(id),
    external_id   VARCHAR(255),
    url           TEXT NOT NULL,
    price_brl     NUMERIC(10,2) NOT NULL,
    is_available  BOOLEAN DEFAULT true,
    affiliate_url TEXT,
    last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(variant_id, merchant_id)
);

CREATE TABLE IF NOT EXISTS price_history (
    id           SERIAL PRIMARY KEY,
    offer_id     INT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    price_brl    NUMERIC(10,2) NOT NULL,
    is_available BOOLEAN DEFAULT true,
    recorded_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PERFORMANCE ENGINE (banco próprio — método âncora+escala)
-- ============================================================

CREATE TABLE IF NOT EXISTS performance_index (
    id                SERIAL PRIMARY KEY,
    product_id        INT NOT NULL REFERENCES products(id),
    benchmark_type    VARCHAR(50) NOT NULL CHECK (benchmark_type IN (
                          'gaming_1080p','gaming_1440p','gaming_4k','rendering','compute')),
    index_value       NUMERIC(8,2) NOT NULL,
    anchor_product_id INT REFERENCES products(id),
    source            VARCHAR(255),
    source_url        TEXT,
    source_date       DATE,
    confidence        NUMERIC(3,2) DEFAULT 0.80 CHECK (confidence BETWEEN 0 AND 1),
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, benchmark_type)
);

CREATE TABLE IF NOT EXISTS fps_estimates (
    id                  SERIAL PRIMARY KEY,
    cpu_id              INT NOT NULL REFERENCES products(id),
    gpu_id              INT NOT NULL REFERENCES products(id),
    game_slug           VARCHAR(100) NOT NULL,
    resolution          VARCHAR(20) NOT NULL CHECK (resolution IN ('1080p','1440p','4k')),
    preset              VARCHAR(20) CHECK (preset IN ('low','medium','high','ultra')),
    fps_estimate        NUMERIC(6,1) NOT NULL,
    fps_low_1pct        NUMERIC(6,1),
    confidence_band_pct NUMERIC(4,1),
    method              VARCHAR(50) DEFAULT 'anchor_scale',
    sources             TEXT[],
    is_crowdsourced     BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cpu_id, gpu_id, game_slug, resolution, preset)
);

-- ============================================================
-- COMPATIBILITY ENGINE
-- ============================================================

CREATE TABLE IF NOT EXISTS compatibility_rules (
    id               SERIAL PRIMARY KEY,
    rule_type        VARCHAR(50) NOT NULL,
    category_a       VARCHAR(50) NOT NULL,
    attribute_a      VARCHAR(100) NOT NULL,
    operator         VARCHAR(20) NOT NULL CHECK (operator IN ('equals','gte','lte','in','not_in')),
    category_b       VARCHAR(50) NOT NULL,
    attribute_b      VARCHAR(100) NOT NULL,
    severity         VARCHAR(20) DEFAULT 'error' CHECK (severity IN ('error','warning','info')),
    message_template TEXT,
    is_active        BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS thermal_rules (
    id               SERIAL PRIMARY KEY,
    product_id       INT REFERENCES products(id),
    tdp_min_w        INT,
    tdp_max_w        INT,
    min_cooler_type  VARCHAR(50) NOT NULL CHECK (min_cooler_type IN (
                         'stock','tower_65w','tower_125w','aio_240','aio_360')),
    min_case_airflow VARCHAR(20) CHECK (min_case_airflow IN ('passive','low','medium','high')),
    notes            TEXT
);

-- ============================================================
-- SLOT MODEL — espaço físico + propagação de restrições
-- ============================================================

CREATE TABLE IF NOT EXISTS case_slots (
    id               SERIAL PRIMARY KEY,
    case_product_id  INT NOT NULL REFERENCES products(id),
    slot_name        VARCHAR(100) NOT NULL,
    slot_type        VARCHAR(50) NOT NULL,
    axis             CHAR(1) NOT NULL CHECK (axis IN ('x','y','z')),
    position_front_mm  NUMERIC(6,1),
    position_top_mm    NUMERIC(6,1),
    position_right_mm  NUMERIC(6,1),
    base_capacity_mm   NUMERIC(6,1) NOT NULL,
    affects_slots      TEXT[] DEFAULT '{}',
    UNIQUE(case_product_id, slot_name)
);

CREATE TABLE IF NOT EXISTS component_footprints (
    id                        SERIAL PRIMARY KEY,
    product_id                INT NOT NULL REFERENCES products(id) UNIQUE,
    length_mm                 NUMERIC(6,1),
    width_mm                  NUMERIC(6,1),
    height_mm                 NUMERIC(6,1),
    installed_thickness_mm    NUMERIC(5,1),
    slot_type_required        VARCHAR(50),
    airflow_zone              VARCHAR(50),
    airflow_resistance_factor NUMERIC(3,2) DEFAULT 0.10
                                  CHECK (airflow_resistance_factor BETWEEN 0 AND 1),
    model_gltf_path           TEXT,
    model_generated_at        TIMESTAMPTZ,
    dimensions_source         VARCHAR(100) DEFAULT 'manufacturer_spec',
    updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AIRFLOW SIMULATION — grafo de zonas dirigido
-- ============================================================

CREATE TABLE IF NOT EXISTS case_airflow_zones (
    id                     SERIAL PRIMARY KEY,
    case_product_id        INT NOT NULL REFERENCES products(id),
    zone_name              VARCHAR(50) NOT NULL,
    zone_type              VARCHAR(20) CHECK (zone_type IN ('intake','exhaust','internal','dead')),
    base_flow_capacity_cfm NUMERIC(6,1),
    connects_to            TEXT[] DEFAULT '{}',
    heat_source_slots      TEXT[] DEFAULT '{}',
    UNIQUE(case_product_id, zone_name)
);

-- ============================================================
-- CURATED BUILDS + TRONOS POR FAIXA
-- ============================================================

CREATE TABLE IF NOT EXISTS curated_builds (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    budget_tier     VARCHAR(20) CHECK (budget_tier IN ('r3k','r5k','r8k','r12k_plus')),
    is_rei          BOOLEAN DEFAULT false,
    cpu_id          INT REFERENCES products(id),
    gpu_id          INT REFERENCES products(id),
    ram_id          INT REFERENCES products(id),
    motherboard_id  INT REFERENCES products(id),
    storage_id      INT REFERENCES products(id),
    psu_id          INT REFERENCES products(id),
    case_id         INT REFERENCES products(id),
    cooler_id       INT REFERENCES products(id),
    total_price_brl NUMERIC(10,2),
    fps_per_brl     NUMERIC(8,4),
    seo_description TEXT,
    is_active       BOOLEAN DEFAULT true,
    crowned_at      TIMESTAMPTZ DEFAULT NOW(),
    dethroned_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id           SERIAL PRIMARY KEY,
    offer_id     INT NOT NULL REFERENCES offers(id),
    build_id     INT REFERENCES curated_builds(id),
    utm_source   VARCHAR(100),
    utm_medium   VARCHAR(100),
    utm_campaign VARCHAR(100),
    referer      TEXT,
    user_agent   TEXT,
    ip_hash      VARCHAR(64),
    clicked_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BUILD SESSIONS — estado do wizard + resultados computados
-- ============================================================

CREATE TABLE IF NOT EXISTS build_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_type  VARCHAR(20) DEFAULT 'new' CHECK (session_type IN ('new','upgrade')),
    budget_brl    NUMERIC(10,2),
    games         TEXT[] DEFAULT '{}',
    priority      VARCHAR(50),
    components    JSONB DEFAULT '{}',
    clearances    JSONB DEFAULT '{}',
    airflow_state JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS build_clearances (
    id                 SERIAL PRIMARY KEY,
    session_id         UUID NOT NULL REFERENCES build_sessions(id) ON DELETE CASCADE,
    slot_name          VARCHAR(100) NOT NULL,
    base_capacity_mm   NUMERIC(6,1) NOT NULL,
    used_mm            NUMERIC(6,1) DEFAULT 0,
    constraint_sources JSONB DEFAULT '[]',
    UNIQUE(session_id, slot_name)
);

CREATE TABLE IF NOT EXISTS build_airflow_state (
    id                 SERIAL PRIMARY KEY,
    session_id         UUID NOT NULL REFERENCES build_sessions(id) ON DELETE CASCADE,
    zone_name          VARCHAR(50) NOT NULL,
    source_cfm         NUMERIC(6,1) DEFAULT 0,
    exhaust_cfm        NUMERIC(6,1) DEFAULT 0,
    effective_flow_cfm NUMERIC(6,1) DEFAULT 0,
    heat_generation_w  INT DEFAULT 0,
    pressure_balance   VARCHAR(20) CHECK (pressure_balance IN ('positive','neutral','negative')),
    airflow_score      INT CHECK (airflow_score BETWEEN 0 AND 100),
    status             VARCHAR(20) DEFAULT 'ok'
                           CHECK (status IN ('ok','tight','critical','dead_zone')),
    UNIQUE(session_id, zone_name)
);

-- ============================================================
-- SEED — lojas parceiras
-- ============================================================

INSERT INTO merchants (slug, name, data_source, is_active) VALUES
    ('kabum',        'KaBuM!',        'scraper', true),
    ('mercadolivre', 'Mercado Livre', 'api',     false),
    ('pichau',       'Pichau',        'feed',    false),
    ('terabyte',     'Terabyte Shop', 'feed',    false)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_offers_variant        ON offers(variant_id);
CREATE INDEX IF NOT EXISTS idx_offers_merchant       ON offers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_offers_price          ON offers(price_brl);
CREATE INDEX IF NOT EXISTS idx_price_history_offer   ON price_history(offer_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fps_estimates_gpucpu  ON fps_estimates(gpu_id, cpu_id);
CREATE INDEX IF NOT EXISTS idx_performance_product   ON performance_index(product_id, benchmark_type);
CREATE INDEX IF NOT EXISTS idx_clicks_offer          ON affiliate_clicks(offer_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category     ON products(category, is_active);
CREATE INDEX IF NOT EXISTS idx_curated_tier_rei      ON curated_builds(budget_tier, is_rei, is_active);
