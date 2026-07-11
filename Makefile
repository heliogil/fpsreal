# Rei do FPS — pc-builder-br dev commands
.PHONY: up down db-shell db-status schema-apply schema-reset test

# Contract + smoke tests: run inside the pcb_api container against the running
# API + seeded DB. Installs test-only deps (pytest) ad-hoc; the prod image stays
# slim. Requires the stack up (`docker compose up -d`).
test:
	docker exec pcb_api sh -c "pip install -q -r requirements-dev.txt && cd /app && python -m pytest tests/"

up:
	docker compose up -d pcb_db

down:
	docker compose down

db-shell:
	docker exec -it pcb_db psql -U pcb_user -d pcb_db

db-status:
	@docker exec pcb_db pg_isready -U pcb_user -d pcb_db
	@docker exec pcb_db psql -U pcb_user -d pcb_db -c '\dt' 2>&1 | head -25

schema-apply:
	docker exec -i pcb_db psql -U pcb_user -d pcb_db < db/schema.sql

schema-reset:
	docker exec -i pcb_db psql -U pcb_user -d pcb_db -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
	$(MAKE) schema-apply
