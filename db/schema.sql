-- Rei do FPS — canonical database schema (GENERATED — do not hand-edit tables).
--
-- Regenerated from the production DB so CI reproduces production exactly:
--   docker exec pcb_db pg_dump -U pcb_user -d pcb_db \
--     --schema-only --no-owner --no-privileges > db/schema.sql
-- Consumed by CI (.github/workflows/ci.yml) and `make schema-apply`. To change
-- the schema, alter it in the DB (or a migration) and re-dump this file.
--
-- PostgreSQL database dump
--

\restrict wfH7kEqvgOx78tAf7CIiV1dZuxQRYvACzyzug1vfE1oRQMEKiPL7xwDf8a1NDsw

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: affiliate_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_clicks (
    id integer NOT NULL,
    offer_id integer NOT NULL,
    build_id integer,
    utm_source character varying(100),
    utm_medium character varying(100),
    utm_campaign character varying(100),
    referer text,
    user_agent text,
    ip_hash character varying(64),
    clicked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: affiliate_clicks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.affiliate_clicks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: affiliate_clicks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.affiliate_clicks_id_seq OWNED BY public.affiliate_clicks.id;


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: build_airflow_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.build_airflow_state (
    id integer NOT NULL,
    session_id uuid NOT NULL,
    zone_name character varying(50) NOT NULL,
    source_cfm numeric(6,1) DEFAULT 0,
    exhaust_cfm numeric(6,1) DEFAULT 0,
    effective_flow_cfm numeric(6,1) DEFAULT 0,
    heat_generation_w integer DEFAULT 0,
    pressure_balance character varying(20),
    airflow_score integer,
    status character varying(20) DEFAULT 'ok'::character varying,
    CONSTRAINT build_airflow_state_airflow_score_check CHECK (((airflow_score >= 0) AND (airflow_score <= 100))),
    CONSTRAINT build_airflow_state_pressure_balance_check CHECK (((pressure_balance)::text = ANY ((ARRAY['positive'::character varying, 'neutral'::character varying, 'negative'::character varying])::text[]))),
    CONSTRAINT build_airflow_state_status_check CHECK (((status)::text = ANY ((ARRAY['ok'::character varying, 'tight'::character varying, 'critical'::character varying, 'dead_zone'::character varying])::text[])))
);


--
-- Name: build_airflow_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.build_airflow_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: build_airflow_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.build_airflow_state_id_seq OWNED BY public.build_airflow_state.id;


--
-- Name: build_clearances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.build_clearances (
    id integer NOT NULL,
    session_id uuid NOT NULL,
    slot_name character varying(100) NOT NULL,
    base_capacity_mm numeric(6,1) NOT NULL,
    used_mm numeric(6,1) DEFAULT 0,
    constraint_sources jsonb DEFAULT '[]'::jsonb
);


--
-- Name: build_clearances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.build_clearances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: build_clearances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.build_clearances_id_seq OWNED BY public.build_clearances.id;


--
-- Name: build_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.build_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_type character varying(20) DEFAULT 'new'::character varying,
    budget_brl numeric(10,2),
    games jsonb DEFAULT '[]'::jsonb,
    priority character varying(50),
    components jsonb DEFAULT '{}'::jsonb NOT NULL,
    clearances jsonb DEFAULT '{}'::jsonb NOT NULL,
    airflow_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT build_sessions_session_type_check CHECK (((session_type)::text = ANY ((ARRAY['new'::character varying, 'upgrade'::character varying])::text[])))
);


--
-- Name: case_airflow_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_airflow_zones (
    id integer NOT NULL,
    case_product_id integer NOT NULL,
    zone_name character varying(50) NOT NULL,
    zone_type character varying(20),
    base_flow_capacity_cfm numeric(6,1),
    connects_to jsonb DEFAULT '[]'::jsonb,
    heat_source_slots jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT case_airflow_zones_zone_type_check CHECK (((zone_type)::text = ANY ((ARRAY['intake'::character varying, 'exhaust'::character varying, 'internal'::character varying, 'dead'::character varying])::text[])))
);


--
-- Name: case_airflow_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.case_airflow_zones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: case_airflow_zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.case_airflow_zones_id_seq OWNED BY public.case_airflow_zones.id;


--
-- Name: case_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_slots (
    id integer NOT NULL,
    case_product_id integer NOT NULL,
    slot_name character varying(100) NOT NULL,
    slot_type character varying(50) NOT NULL,
    axis character varying(1) NOT NULL,
    position_front_mm numeric(6,1),
    position_top_mm numeric(6,1),
    position_right_mm numeric(6,1),
    base_capacity_mm numeric(6,1) NOT NULL,
    affects_slots jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT case_slots_axis_check CHECK (((axis)::bpchar = ANY (ARRAY['x'::bpchar, 'y'::bpchar, 'z'::bpchar])))
);


--
-- Name: case_slots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.case_slots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: case_slots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.case_slots_id_seq OWNED BY public.case_slots.id;


--
-- Name: compatibility_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compatibility_rules (
    id integer NOT NULL,
    rule_type character varying(50) NOT NULL,
    category_a character varying(50) NOT NULL,
    attribute_a character varying(100) NOT NULL,
    operator character varying(20) NOT NULL,
    category_b character varying(50) NOT NULL,
    attribute_b character varying(100) NOT NULL,
    severity character varying(20) DEFAULT 'error'::character varying,
    message_template text,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT compatibility_rules_operator_check CHECK (((operator)::text = ANY ((ARRAY['equals'::character varying, 'gte'::character varying, 'lte'::character varying, 'in'::character varying, 'not_in'::character varying])::text[]))),
    CONSTRAINT compatibility_rules_severity_check CHECK (((severity)::text = ANY ((ARRAY['error'::character varying, 'warning'::character varying, 'info'::character varying])::text[])))
);


--
-- Name: compatibility_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compatibility_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compatibility_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compatibility_rules_id_seq OWNED BY public.compatibility_rules.id;


--
-- Name: component_footprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_footprints (
    id integer NOT NULL,
    product_id integer NOT NULL,
    length_mm numeric(6,1),
    width_mm numeric(6,1),
    height_mm numeric(6,1),
    installed_thickness_mm numeric(5,1),
    slot_type_required character varying(50),
    airflow_zone character varying(50),
    airflow_resistance_factor numeric(3,2) DEFAULT 0.10,
    model_gltf_path text,
    model_generated_at timestamp with time zone,
    dimensions_source character varying(100) DEFAULT 'manufacturer_spec'::character varying,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT component_footprints_airflow_resistance_factor_check CHECK (((airflow_resistance_factor >= (0)::numeric) AND (airflow_resistance_factor <= (1)::numeric)))
);


--
-- Name: component_footprints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.component_footprints_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: component_footprints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.component_footprints_id_seq OWNED BY public.component_footprints.id;


--
-- Name: curated_builds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curated_builds (
    id integer NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    budget_tier character varying(20),
    is_rei boolean DEFAULT false NOT NULL,
    cpu_id integer,
    gpu_id integer,
    ram_id integer,
    motherboard_id integer,
    storage_id integer,
    psu_id integer,
    case_id integer,
    cooler_id integer,
    total_price_brl numeric(10,2),
    fps_per_brl numeric(8,4),
    seo_description text,
    is_active boolean DEFAULT true NOT NULL,
    crowned_at timestamp with time zone DEFAULT now() NOT NULL,
    dethroned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT curated_builds_budget_tier_check CHECK (((budget_tier)::text = ANY ((ARRAY['r3k'::character varying, 'r5k'::character varying, 'r8k'::character varying, 'r12k_plus'::character varying])::text[])))
);


--
-- Name: curated_builds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.curated_builds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: curated_builds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.curated_builds_id_seq OWNED BY public.curated_builds.id;


--
-- Name: fps_estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fps_estimates (
    id integer NOT NULL,
    cpu_id integer NOT NULL,
    gpu_id integer NOT NULL,
    game_slug character varying(100) NOT NULL,
    resolution character varying(20) NOT NULL,
    preset character varying(20),
    fps_estimate numeric(6,1) NOT NULL,
    fps_low_1pct numeric(6,1),
    confidence_band_pct numeric(4,1),
    method character varying(50) DEFAULT 'anchor_scale'::character varying,
    sources jsonb,
    is_crowdsourced boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fps_estimates_preset_check CHECK (((preset)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'ultra'::character varying])::text[]))),
    CONSTRAINT fps_estimates_resolution_check CHECK (((resolution)::text = ANY ((ARRAY['1080p'::character varying, '1440p'::character varying, '4k'::character varying])::text[])))
);


--
-- Name: fps_estimates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fps_estimates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fps_estimates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fps_estimates_id_seq OWNED BY public.fps_estimates.id;


--
-- Name: merchants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchants (
    id integer NOT NULL,
    slug character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    affiliate_base_url text,
    data_source character varying(20),
    is_active boolean DEFAULT true NOT NULL,
    last_sync_at timestamp with time zone,
    CONSTRAINT merchants_data_source_check CHECK (((data_source)::text = ANY ((ARRAY['api'::character varying, 'feed'::character varying, 'scraper'::character varying])::text[])))
);


--
-- Name: merchants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.merchants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: merchants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.merchants_id_seq OWNED BY public.merchants.id;


--
-- Name: offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offers (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    merchant_id integer NOT NULL,
    external_id character varying(255),
    url text NOT NULL,
    price_brl numeric(10,2) NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    affiliate_url text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: offers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offers_id_seq OWNED BY public.offers.id;


--
-- Name: performance_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_index (
    id integer NOT NULL,
    product_id integer NOT NULL,
    benchmark_type character varying(50) NOT NULL,
    index_value numeric(8,2) NOT NULL,
    anchor_product_id integer,
    source character varying(255),
    source_url text,
    source_date date,
    confidence numeric(3,2) DEFAULT 0.80,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT performance_index_benchmark_type_check CHECK (((benchmark_type)::text = ANY ((ARRAY['gaming_1080p'::character varying, 'gaming_1440p'::character varying, 'gaming_4k'::character varying, 'rendering'::character varying, 'compute'::character varying])::text[]))),
    CONSTRAINT performance_index_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);


--
-- Name: performance_index_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.performance_index_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: performance_index_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.performance_index_id_seq OWNED BY public.performance_index.id;


--
-- Name: price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_history (
    id integer NOT NULL,
    offer_id integer NOT NULL,
    price_brl numeric(10,2) NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: price_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.price_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: price_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.price_history_id_seq OWNED BY public.price_history.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    sku character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(50) NOT NULL,
    brand character varying(100),
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_category_check CHECK (((category)::text = ANY ((ARRAY['cpu'::character varying, 'gpu'::character varying, 'ram'::character varying, 'motherboard'::character varying, 'storage'::character varying, 'psu'::character varying, 'case'::character varying, 'cooler'::character varying, 'fan'::character varying])::text[])))
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: thermal_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thermal_rules (
    id integer NOT NULL,
    product_id integer,
    tdp_min_w integer,
    tdp_max_w integer,
    min_cooler_type character varying(50) NOT NULL,
    min_case_airflow character varying(20),
    notes text,
    CONSTRAINT thermal_rules_min_case_airflow_check CHECK (((min_case_airflow)::text = ANY ((ARRAY['passive'::character varying, 'low'::character varying, 'medium'::character varying, 'high'::character varying])::text[]))),
    CONSTRAINT thermal_rules_min_cooler_type_check CHECK (((min_cooler_type)::text = ANY ((ARRAY['stock'::character varying, 'tower_65w'::character varying, 'tower_125w'::character varying, 'aio_240'::character varying, 'aio_360'::character varying])::text[])))
);


--
-- Name: thermal_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.thermal_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: thermal_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.thermal_rules_id_seq OWNED BY public.thermal_rules.id;


--
-- Name: variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variants (
    id integer NOT NULL,
    product_id integer NOT NULL,
    variant_name character varying(255),
    ean character varying(50),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: variants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: variants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.variants_id_seq OWNED BY public.variants.id;


--
-- Name: affiliate_clicks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_clicks ALTER COLUMN id SET DEFAULT nextval('public.affiliate_clicks_id_seq'::regclass);


--
-- Name: build_airflow_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_airflow_state ALTER COLUMN id SET DEFAULT nextval('public.build_airflow_state_id_seq'::regclass);


--
-- Name: build_clearances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_clearances ALTER COLUMN id SET DEFAULT nextval('public.build_clearances_id_seq'::regclass);


--
-- Name: case_airflow_zones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_airflow_zones ALTER COLUMN id SET DEFAULT nextval('public.case_airflow_zones_id_seq'::regclass);


--
-- Name: case_slots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_slots ALTER COLUMN id SET DEFAULT nextval('public.case_slots_id_seq'::regclass);


--
-- Name: compatibility_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compatibility_rules ALTER COLUMN id SET DEFAULT nextval('public.compatibility_rules_id_seq'::regclass);


--
-- Name: component_footprints id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_footprints ALTER COLUMN id SET DEFAULT nextval('public.component_footprints_id_seq'::regclass);


--
-- Name: curated_builds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds ALTER COLUMN id SET DEFAULT nextval('public.curated_builds_id_seq'::regclass);


--
-- Name: fps_estimates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_estimates ALTER COLUMN id SET DEFAULT nextval('public.fps_estimates_id_seq'::regclass);


--
-- Name: merchants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants ALTER COLUMN id SET DEFAULT nextval('public.merchants_id_seq'::regclass);


--
-- Name: offers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers ALTER COLUMN id SET DEFAULT nextval('public.offers_id_seq'::regclass);


--
-- Name: performance_index id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_index ALTER COLUMN id SET DEFAULT nextval('public.performance_index_id_seq'::regclass);


--
-- Name: price_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_history ALTER COLUMN id SET DEFAULT nextval('public.price_history_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: thermal_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thermal_rules ALTER COLUMN id SET DEFAULT nextval('public.thermal_rules_id_seq'::regclass);


--
-- Name: variants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants ALTER COLUMN id SET DEFAULT nextval('public.variants_id_seq'::regclass);


--
-- Name: affiliate_clicks affiliate_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_clicks
    ADD CONSTRAINT affiliate_clicks_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: build_airflow_state build_airflow_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_airflow_state
    ADD CONSTRAINT build_airflow_state_pkey PRIMARY KEY (id);


--
-- Name: build_airflow_state build_airflow_state_session_zone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_airflow_state
    ADD CONSTRAINT build_airflow_state_session_zone_key UNIQUE (session_id, zone_name);


--
-- Name: build_clearances build_clearances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_clearances
    ADD CONSTRAINT build_clearances_pkey PRIMARY KEY (id);


--
-- Name: build_clearances build_clearances_session_slot_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_clearances
    ADD CONSTRAINT build_clearances_session_slot_key UNIQUE (session_id, slot_name);


--
-- Name: build_sessions build_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_sessions
    ADD CONSTRAINT build_sessions_pkey PRIMARY KEY (id);


--
-- Name: case_airflow_zones case_airflow_zones_case_zone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_airflow_zones
    ADD CONSTRAINT case_airflow_zones_case_zone_key UNIQUE (case_product_id, zone_name);


--
-- Name: case_airflow_zones case_airflow_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_airflow_zones
    ADD CONSTRAINT case_airflow_zones_pkey PRIMARY KEY (id);


--
-- Name: case_slots case_slots_case_slot_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_slots
    ADD CONSTRAINT case_slots_case_slot_name_key UNIQUE (case_product_id, slot_name);


--
-- Name: case_slots case_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_slots
    ADD CONSTRAINT case_slots_pkey PRIMARY KEY (id);


--
-- Name: compatibility_rules compatibility_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compatibility_rules
    ADD CONSTRAINT compatibility_rules_pkey PRIMARY KEY (id);


--
-- Name: component_footprints component_footprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_footprints
    ADD CONSTRAINT component_footprints_pkey PRIMARY KEY (id);


--
-- Name: component_footprints component_footprints_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_footprints
    ADD CONSTRAINT component_footprints_product_id_key UNIQUE (product_id);


--
-- Name: curated_builds curated_builds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_pkey PRIMARY KEY (id);


--
-- Name: curated_builds curated_builds_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_slug_key UNIQUE (slug);


--
-- Name: fps_estimates fps_estimates_cpu_gpu_game_res_preset_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_estimates
    ADD CONSTRAINT fps_estimates_cpu_gpu_game_res_preset_key UNIQUE (cpu_id, gpu_id, game_slug, resolution, preset);


--
-- Name: fps_estimates fps_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_estimates
    ADD CONSTRAINT fps_estimates_pkey PRIMARY KEY (id);


--
-- Name: merchants merchants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_pkey PRIMARY KEY (id);


--
-- Name: merchants merchants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_slug_key UNIQUE (slug);


--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (id);


--
-- Name: offers offers_variant_merchant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_variant_merchant_key UNIQUE (variant_id, merchant_id);


--
-- Name: performance_index performance_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_index
    ADD CONSTRAINT performance_index_pkey PRIMARY KEY (id);


--
-- Name: performance_index performance_index_product_benchmark_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_index
    ADD CONSTRAINT performance_index_product_benchmark_key UNIQUE (product_id, benchmark_type);


--
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: thermal_rules thermal_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thermal_rules
    ADD CONSTRAINT thermal_rules_pkey PRIMARY KEY (id);


--
-- Name: variants variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_pkey PRIMARY KEY (id);


--
-- Name: affiliate_clicks affiliate_clicks_build_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_clicks
    ADD CONSTRAINT affiliate_clicks_build_id_fkey FOREIGN KEY (build_id) REFERENCES public.curated_builds(id);


--
-- Name: affiliate_clicks affiliate_clicks_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_clicks
    ADD CONSTRAINT affiliate_clicks_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id);


--
-- Name: build_airflow_state build_airflow_state_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_airflow_state
    ADD CONSTRAINT build_airflow_state_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.build_sessions(id) ON DELETE CASCADE;


--
-- Name: build_clearances build_clearances_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_clearances
    ADD CONSTRAINT build_clearances_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.build_sessions(id) ON DELETE CASCADE;


--
-- Name: case_airflow_zones case_airflow_zones_case_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_airflow_zones
    ADD CONSTRAINT case_airflow_zones_case_product_id_fkey FOREIGN KEY (case_product_id) REFERENCES public.products(id);


--
-- Name: case_slots case_slots_case_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_slots
    ADD CONSTRAINT case_slots_case_product_id_fkey FOREIGN KEY (case_product_id) REFERENCES public.products(id);


--
-- Name: component_footprints component_footprints_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_footprints
    ADD CONSTRAINT component_footprints_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: curated_builds curated_builds_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.products(id);


--
-- Name: curated_builds curated_builds_cooler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_cooler_id_fkey FOREIGN KEY (cooler_id) REFERENCES public.products(id);


--
-- Name: curated_builds curated_builds_cpu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_cpu_id_fkey FOREIGN KEY (cpu_id) REFERENCES public.products(id);


--
-- Name: curated_builds curated_builds_gpu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_gpu_id_fkey FOREIGN KEY (gpu_id) REFERENCES public.products(id);


--
-- Name: curated_builds curated_builds_motherboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_motherboard_id_fkey FOREIGN KEY (motherboard_id) REFERENCES public.products(id);


--
-- Name: curated_builds curated_builds_psu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_psu_id_fkey FOREIGN KEY (psu_id) REFERENCES public.products(id);


--
-- Name: curated_builds curated_builds_ram_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_ram_id_fkey FOREIGN KEY (ram_id) REFERENCES public.products(id);


--
-- Name: curated_builds curated_builds_storage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_builds
    ADD CONSTRAINT curated_builds_storage_id_fkey FOREIGN KEY (storage_id) REFERENCES public.products(id);


--
-- Name: fps_estimates fps_estimates_cpu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_estimates
    ADD CONSTRAINT fps_estimates_cpu_id_fkey FOREIGN KEY (cpu_id) REFERENCES public.products(id);


--
-- Name: fps_estimates fps_estimates_gpu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_estimates
    ADD CONSTRAINT fps_estimates_gpu_id_fkey FOREIGN KEY (gpu_id) REFERENCES public.products(id);


--
-- Name: offers offers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: offers offers_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE CASCADE;


--
-- Name: performance_index performance_index_anchor_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_index
    ADD CONSTRAINT performance_index_anchor_product_id_fkey FOREIGN KEY (anchor_product_id) REFERENCES public.products(id);


--
-- Name: performance_index performance_index_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_index
    ADD CONSTRAINT performance_index_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: price_history price_history_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;


--
-- Name: thermal_rules thermal_rules_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thermal_rules
    ADD CONSTRAINT thermal_rules_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: variants variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict wfH7kEqvgOx78tAf7CIiV1dZuxQRYvACzyzug1vfE1oRQMEKiPL7xwDf8a1NDsw

