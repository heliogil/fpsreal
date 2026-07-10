# Rei do FPS

> **R$ por FPS.** The BR-native tool that ranks gamer PC builds by **cost-per-FPS** — not specs, not hype.
> *(Working name was "FPSReal"; the repo keeps that slug. Brand is **Rei do FPS**, mascot **Harpia** — "a Harpia observa".)*

**Domain:** `reidofps.com.br` · **Audience:** Brazil · **Model:** media/SEO + affiliate.

---

## Status — honest snapshot (2026-07-09)

The project is **whole on the price-independent half and blocked on the priced half.**

- ✅ **Foundation + technical moat are live.** Catalog, the FPS estimation engine, and the compatibility engine are seeded and served by the API. A live page (`/pecas`) renders real data.
- ⏳ **Everything that needs `R$` is blocked on one human step:** joining the affiliate programs and wiring their official feeds. Prices → cost/FPS ranking → "Tronos" → ranked wizard → anomaly content → launch all depend on it.

This is **not** where the old README put us ("Sprint 1 in progress"). We finished the data foundation and, because they don't need prices, built chunks of Sprint 3/4 **out of order**.

---

## What changed since the first plan (read this)

If you're comparing against the original 6-sprint README, three things diverged materially:

1. **Data strategy pivoted: official affiliate feeds, _zero scraping_.**
   The original thesis was a "price data moat via scraping" (Playwright, anti-bot probe). That was **dropped**. We now take prices **only** from official affiliate feeds/APIs (KaBuM, Mercado Livre Developers first). Playwright was removed; the anti-bot probe is obsolete. **The moat moved** from scraped prices to the **FPS estimation + compatibility/airflow engines** — our own code, not someone else's catalog.

2. **Scope expanded well beyond a "rules engine + 3D viewer".**
   The schema (17 tables) already models a **slot-based physical fit engine** (clearance propagation), an **airflow simulation** (directed zone graph — the "wind tunnel"), **thermal rules**, and **"Tronos por faixa"** (a King per budget tier). Plus a hard **integrity contract** (below).

3. **Integrity rule (non-negotiable): we _estimate_ FPS, we never _measure_ it.**
   Every FPS figure carries `method`, a confidence band, and its sources. We only say "measured" for **price**. Estimates use an anchor+scale method over public relative-performance data, with crowdsourced calibration planned as the long-term moat.

---

## What's live right now (verified)

Served by `pcb_api` (FastAPI, port `8100`), data in `pcb_db` (PostgreSQL 16, port `5434`):

| Surface | Endpoint | State |
|---|---|---|
| Catalog | `GET /products` (with `specs`) | **Live** — 48 real products (GPU/CPU/RAM/mobo/storage/PSU/case/cooler) |
| FPS estimates | `GET /fps?cpu=&gpu=&game=&res=` | **Live** — 663 rows, `method=anchor_scale`, confidence band, sources |
| Compatibility | `POST /compatibility/check` | **Live** — socket/RAM/clearance rules + PSU headroom |
| Offers (prices) | `GET /offers`, `/offers/best`, `/offers/:id/history` | **Live but empty by design** — no fabricated prices; waits for feeds |
| Click tracking | `POST /track/click` | **Live** — records to `affiliate_clicks` |
| Curated builds | `GET /builds`, `/builds/:tier/rei` | Schema + endpoint ready; **needs prices to crown** |
| Wizard | `POST /wizard` | Ranks CPU+GPU by `avg_fps / price`; **returns empty until prices exist** |

**Live web surface:** `apps/web` (Next.js 14, port `3100`).
- `/pecas` — **live** catalog + FPS explorer (SSR fetch to the internal API; real data in the HTML).
- Home / Tronos / Wizard — still on the **mock** repository (they're price-dependent) until feeds land.

---

## The engines

- **FPS (anchor+scale).** `fps ≈ gpu_1080p_aggregate × game_demand_factor × cpu_tier_factor`, bounded by per-game engine caps (e.g. Elden Ring 60). Seeded from a cited public source with a ±18% band. Cold-start is honest-by-construction; crowdsourced calibration (`is_crowdsourced`) is the planned upgrade.
- **Compatibility.** Data-driven rules (`compatibility_rules`) evaluated against each product's `specs` JSONB: CPU/motherboard socket, RAM type, GPU/case & cooler/case clearance, plus a computed PSU-headroom warning.
- **Physical fit (slots).** `case_slots` + `component_footprints` model the case as 3D slots with clearance propagation (a fan reduces adjacent GPU clearance, etc.). *Data model in place; solver is next.*
- **Airflow ("wind tunnel").** `case_airflow_zones` + `build_airflow_state` model a directed zone-flow graph (intake → cpu/gpu zones → exhaust) producing an airflow score. *Schema in place; Phase 1 (textual) is the next build.*
- **Thermal.** `thermal_rules` map a CPU TDP band → minimum cooler class + case airflow.

---

## Architecture

```
apps/web/                Next.js 14 + TypeScript + Tailwind (Harpia design system)
services/ingestion/       FastAPI + Python 3.11 + SQLAlchemy 2.0 + Alembic
services/ingestion/seed/  Idempotent catalog + performance + FPS + rules seed
packages/contracts/       Shared TypeScript entity/repository types
db/schema.sql             Canonical 17-table schema (see note below)
compose.yaml              pcb_db (5434) · pcb_api (8100) · pcb_web (3100)
```

**No Playwright** — removed with the no-scraping pivot.

> ⚠️ **Known drift:** `db/schema.sql` lags the real Alembic migration in one place (`fps_estimates.sources` is `TEXT[]` in the SQL file but `jsonb` in the migrated DB). The migration/DB is the source of truth.

---

## Sprint reality

| Sprint | Original plan | Reality |
|---|---|---|
| 0 — Gates | anti-bot probe, affiliate research, capacity baseline | Probe **obsolete** (no scraping); research/baseline done |
| 1 — Data foundation | monorepo, schema, catalog seed | ✅ **Done** — schema expanded to 17 tables; seed loaded |
| 2 — Live prices | KaBuM + ML adapters | ⏳ **Not started** — `adapters/` empty; blocked on affiliate feeds |
| 3 — Compat & FPS | rules engine, benchmarks, cost/FPS | 🔄 Compat + FPS engines **live** (out of order); cost/FPS needs prices |
| 4 — Usable product | wizard, affiliate tracking | 🔄 Wizard scaffolded (mock); `/track` live |
| 5 — Distribution | SEO pages, 3D viewer | ⏳ Not built (airflow/slot **data model** exists; viewer does not) |
| 6 — Launch | QA, observability, go-live | ⏳ Not started (needs prices) |

**The one gate that unblocks the rest:** official affiliate feeds. Everything priced is downstream of it.

---

## Monetization & content

- **Affiliate commissions** (KaBuM, Mercado Livre first; Pichau/Terabyte after feeds). Target R$0.5k–5k/mo year 1 (media/SEO model).
- **Content engine (planned):** anomaly detection over price/FPS data auto-generates copy — *"the RTX 4070 Super delivers 94% of the 4080's FPS at 71% of the cost."* The **FPS half already exists**; it becomes near-trivial once prices land. Mix: ~70% anomalies + 30% technical education.

---

## Local development

```bash
docker compose up -d                 # pcb_db (5434), pcb_api (8100), pcb_web (3100)
# seed the DB (idempotent; never seeds prices):
docker exec -w /app pcb_api python -m seed.run_seed
# smoke:
curl 'http://localhost:8100/products/?category=gpu&limit=3'
curl 'http://localhost:8100/fps/?cpu=<id>&gpu=<id>&res=1080p'
# live catalog + FPS:  http://localhost:3100/pecas
```

---

## Notes

- **Prices are never fabricated.** Offers stay empty until an official feed provides them.
- **Anti-ghost discipline:** "in the repo = done." Foundation was bootstrapped by an AI agent factory (2026-07-07); the seed, the `/fps` `/offers` `/compatibility` `/track` routers, the model FK fix, and the live `/pecas` page were built and verified interactively.
- **Human track (only the founder):** join affiliate programs + wire feeds; register the Mercado Livre Developers app; INPI classes 09+35+41+42.
- **Stack isolation:** everything lives in `/opt/pc-builder-br` on its own `pcb_net` Docker network; never touches other services.
