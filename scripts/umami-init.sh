#!/bin/sh
# Prepara o Umami (analytics próprio) na VPS. Idempotente.
#
#   cd /opt/pc-builder-br && sh scripts/umami-init.sh
#
# 1. gera UMAMI_DB_PASSWORD e UMAMI_APP_SECRET no .env (se ainda não existem) —
#    segredos gerados no servidor, nunca impressos;
# 2. cria o papel `umami` e a base `umami` no pcb_db;
# 3. sobe o container (perfil "analytics") e espera ficar de pé.
#
# Depois (passo humano, uma vez): abrir o painel por túnel SSH
#   ssh -L 3300:127.0.0.1:3300 root@<vps>   →   http://localhost:3300
# entrar com admin / umami, TROCAR A SENHA, criar o site reidofps.com.br e pôr o
# id em UMAMI_WEBSITE_ID no .env; então: docker compose build pcb_web && docker compose up -d pcb_web
set -eu
cd "$(dirname "$0")/.."

gen() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }
grep -q '^UMAMI_DB_PASSWORD=.\+' .env || echo "UMAMI_DB_PASSWORD=$(gen)" >> .env
grep -q '^UMAMI_APP_SECRET=.\+' .env  || echo "UMAMI_APP_SECRET=$(gen)" >> .env
grep -q '^UMAMI_WEBSITE_ID=' .env     || echo "UMAMI_WEBSITE_ID=" >> .env

PW=$(grep '^UMAMI_DB_PASSWORD=' .env | tail -1 | cut -d= -f2-)
docker exec -i pcb_db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres' <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'umami') THEN
    CREATE ROLE umami LOGIN PASSWORD '$PW';
  ELSE
    ALTER ROLE umami WITH LOGIN PASSWORD '$PW';
  END IF;
END \$\$;
SQL
docker exec pcb_db sh -c 'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='"'"'umami'"'"'"' | grep -q 1 \
  || docker exec pcb_db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE umami OWNER umami"'

docker compose --profile analytics up -d pcb_umami
for i in $(seq 1 60); do
  if curl -sf -o /dev/null http://127.0.0.1:3300/api/heartbeat; then echo "umami up"; exit 0; fi
  sleep 3
done
echo "umami não respondeu — ver: docker logs pcb_umami" >&2
exit 1
