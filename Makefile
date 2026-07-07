# Rei do FPS — pc-builder-br dev commands
.PHONY: up down db-shell db-status schema-apply schema-reset

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
