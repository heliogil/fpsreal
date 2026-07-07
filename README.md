# Rei do FPS — pc-builder-br

Comparador brasileiro de builds gamer por custo/FPS.
Stack: Next.js 14 + FastAPI + PostgreSQL 16.

## Estrutura

```
apps/web/           — Next.js 14 frontend (port 3100)
services/ingestion/ — FastAPI ingestion service (port 8100)
packages/contracts/ — TypeScript types compartilhados
db/                 — Schema SQL + migrations
scripts/            — Utilitários de manutenção
```

## Setup rápido

```bash
cp .env.example .env   # preencher POSTGRES_PASSWORD
make up                # sobe pcb_db
make schema-apply      # aplica as 17 tabelas
make db-status         # verifica
```

## Portas

| Serviço | Porta | Estado     |
|---------|-------|------------|
| pcb_db  | 5434  | ativo      |
| pcb_api | 8100  | pendente   |
| pcb_web | 3100  | pendente   |

## Guardrails

- Nunca tocar em: sharp_db, sharp_n8n, n8n, portainer, nexus_prover
- Nunca alterar /opt/venture-studio/docker-compose.yml ou .env
- Stack completamente isolada em /opt/pc-builder-br
- Rede Docker isolada: pcb_net
