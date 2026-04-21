# docker/ — Infraestrutura Local e Produção

## O que este diretório faz

Contém os arquivos Docker Compose, Dockerfiles e config do Nginx para desenvolvimento local e produção (Hostinger VPS) do Nocrato Health V2.

## Arquivos

| Arquivo | Propósito |
|---|---|
| `docker-compose.dev.yml` | Ambiente de desenvolvimento local — PostgreSQL 16 apenas |
| `docker-compose.prod.yml` | Ambiente de produção — todos os serviços (PostgreSQL, Bugsink, API, Web, Nginx) |
| `Dockerfile.api` | Build multi-stage da API NestJS (`@nocrato/api`) |
| `Dockerfile.web` | Build multi-stage do frontend React (`@nocrato/web`) + nginx interno para SPA |
| `nginx.conf` | Config do Nginx reverse proxy + SSL termination para app.nocrato.com |

## Serviços (dev)

| Serviço | Imagem | Porta | Credenciais |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | `5432` | user: `nocrato` / db: `nocrato_health` / pass: `nocrato_secret` |
| `bugsink` | `bugsink/bugsink:2` | `127.0.0.1:8000` | via `.env`: `BUGSINK_ADMIN_EMAIL` / `BUGSINK_ADMIN_PASSWORD` |

## Serviços (prod)

| Serviço | Imagem | Porta interna | Descrição |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | `5432` | Banco de dados principal (hospeda também o DB do Bugsink) |
| `bugsink` | `bugsink/bugsink:2` | `127.0.0.1:8000` | Error tracking self-hosted. Acesso via SSH tunnel (nunca público) |
| `api` | build local | `3000` | NestJS backend (WhatsApp via Meta Cloud API — sem gateway intermediário) |
| `web` | build local | `80` | React SPA (nginx estático) |
| `nginx` | `nginx:alpine` | `80`, `443` | Reverse proxy público + SSL |

## Acesso ao Bugsink (SSH tunnel)

Bugsink é bindado apenas em `127.0.0.1:8000` — não tem entrada no Nginx, não existe na internet pública. Para acessar a UI da sua máquina local:

```bash
# Opção 1: tunnel ad-hoc
ssh -L 8000:localhost:8000 <user>@<vps-host>
# deixe o terminal aberto, abra http://localhost:8000 no browser

# Opção 2: alias em ~/.ssh/config (recomendado)
# Host nocrato-bugs
#     HostName <vps-host>
#     User <user>
#     LocalForward 8000 localhost:8000
ssh nocrato-bugs
# http://localhost:8000
```

Notificações de novos erros chegam por email (Resend) independentemente do acesso à UI.

## Adicionar DB do Bugsink a um Postgres existente

O init script `postgres-init/01-bugsink.sh` só roda no primeiro boot (volume vazio). Se o volume já existe (dev ou prod atual), criar manualmente:

```bash
# Dev
docker exec nocrato_postgres psql -U nocrato -d postgres -c \
  "CREATE USER bugsink WITH ENCRYPTED PASSWORD '${BUGSINK_DB_PASSWORD}';"
docker exec nocrato_postgres psql -U nocrato -d postgres -c \
  "CREATE DATABASE bugsink OWNER bugsink;"
docker exec nocrato_postgres psql -U nocrato -d postgres -c \
  "GRANT ALL PRIVILEGES ON DATABASE bugsink TO bugsink;"

# Prod (mesma coisa, trocar container por nocrato_postgres_prod e user por ${DB_USER})
```

## Contexto de build (docker-compose.prod.yml)

O contexto de build é `..` (raiz do monorepo), porque os Dockerfiles precisam acessar
`pnpm-workspace.yaml`, `turbo.json` e os workspaces `apps/api` e `apps/web`.

## Como usar

```bash
# ──── Desenvolvimento ────

# Subir banco local
docker compose -f docker/docker-compose.dev.yml up -d

# Verificar status e health
docker compose -f docker/docker-compose.dev.yml ps

# Ver logs
docker compose -f docker/docker-compose.dev.yml logs postgres

# Derrubar (mantém volume com dados)
docker compose -f docker/docker-compose.dev.yml down

# Derrubar E apagar dados (reset total)
docker compose -f docker/docker-compose.dev.yml down -v

# ──── Produção (Hostinger) ────

# Build das imagens (rodar na raiz do monorepo)
docker compose -f docker/docker-compose.prod.yml build

# Subir todos os serviços
docker compose -f docker/docker-compose.prod.yml up -d

# Ver logs em tempo real
docker compose -f docker/docker-compose.prod.yml logs -f

# Rodar migrations manualmente
docker compose -f docker/docker-compose.prod.yml run --rm -e NODE_ENV=production api node dist/database/migrate.js

# Rodar seed manualmente
docker compose -f docker/docker-compose.prod.yml run --rm -e NODE_ENV=production api node dist/database/seed.js
```

## Regras

- O volume `nocrato_postgres_data` persiste os dados entre restarts — nunca usar `-v` em produção
- As credenciais do dev (`nocrato_secret`) são fixas e não-secretas — apenas para ambiente local
- Em produção, todas as credenciais vêm do `.env` na raiz do monorepo — nunca commitado
- O volume `uploads_data` é compartilhado entre `api` (escrita) e `nginx` (leitura read-only)
- Certificados Let's Encrypt são bind-mounted de `/etc/letsencrypt` do host (não volume nomeado) — o Certbot no host escreve lá, o nginx lê read-only
- WhatsApp roda via Meta Cloud API — **sem gateway intermediário**. Webhook público em `/api/v1/agent/webhook/cloud` (validado por HMAC-SHA256)

## O que NÃO pertence aqui

- Configuração do NestJS (pertence a `apps/api/`)
- Variáveis de ambiente de produção (ficam no `.env` do servidor Hostinger)
- Redis, S3, ou qualquer serviço fora do escopo MVP
