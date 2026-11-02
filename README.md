# Rei do FPS — [reidofps.com.br](https://reidofps.com.br)

> **"Which gaming PC gives me the most FPS for my money?"** — a Brazilian comparator that ranks PC builds by **cost per FPS**, not by specs or hype.

**Live since 2026-08-13** · Audience: Brazilian PC gamers · Model: SEO content + affiliate commissions · Repo slug keeps the working name `fpsreal`.

---

## The case in one page

**Problem.** Brazilian buyers compare parts by spec sheets and influencer hype. Prices in R$ swing a lot between stores, and nobody answers the real question: *with my budget and my games, which build gives the most frames per real spent?*

**Positioning.** One number that a non-expert understands: **R$ per FPS**. Each budget tier gets a "King" (*Rei*), the build with the best R$/FPS in that tier. The brand (Rei do FPS, mascot Harpia, *"a Harpia observa"*) was built around a trust promise, because the category is full of inflated numbers:

> **We estimate FPS, we never fake it.** Every FPS figure ships with its method, a confidence band and its sources. Only prices are called "measured".

**Data product.**
- Catalog of real parts (GPU, CPU, RAM, motherboard, storage, PSU, case, cooler) from 5 merchants.
- FPS engine calibrated in Aug/2026 against a single-bench public benchmark (48 GPUs, same test rig); 17 of 20 catalog GPUs recalibrated, one was off by ~20 points.
- Compatibility rules (socket, RAM type, GPU/cooler clearance, PSU headroom).
- Affiliate click tracking, so every recommendation can be tied to revenue.

**Go-to-market.**
- **Distribution:** SEO pages + content generated from the data. Price/FPS anomalies become posts (*"this GPU delivers 94% of that one's FPS at 71% of the cost"*), so content scales with the catalog, not with writing hours.
- **Monetization:** affiliate commissions (KaBuM and Mercado Livre first).
- **Pivot that mattered:** the first plan was to scrape store prices. It was dropped for **official affiliate feeds only** — legally clean, and it moved the moat from someone else's prices to our own FPS and compatibility engines.
- **Kill criteria written before launch:** fewer than 500 affiliate clicks in 90 days → archive.

## Status — honest snapshot (2026-11-02)

| | State |
|---|---|
| Site, catalog, FPS explorer, curated builds, wizard | ✅ Live at reidofps.com.br (HTTPS) |
| FPS engine | ✅ Calibrated (GPU anchor); game and CPU factors still heuristic |
| Prices | ⏳ **Sample prices, labeled as demo on the site.** The pipeline is real; it waits for the official affiliate feeds |
| Affiliate revenue | ⏳ Starts when feeds are wired |

Full calibration notes: [`docs/FPS-CALIBRACAO.md`](docs/FPS-CALIBRACAO.md) (PT-BR).

---

## How it works (technical)

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
