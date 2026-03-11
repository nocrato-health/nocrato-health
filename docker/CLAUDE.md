# docker/ — Infraestrutura Local e Produção

## O que este diretório faz

Contém os arquivos Docker Compose, Dockerfiles e config do Nginx para desenvolvimento local e produção (Hostinger VPS) do Nocrato Health V2.

## Arquivos

| Arquivo | Propósito |
|---|---|
| `docker-compose.dev.yml` | Ambiente de desenvolvimento local — PostgreSQL 16 apenas |
| `docker-compose.prod.yml` | Ambiente de produção — todos os serviços (PostgreSQL, Evolution, API, Web, Nginx) |
| `Dockerfile.api` | Build multi-stage da API NestJS (`@nocrato/api`) |
| `Dockerfile.web` | Build multi-stage do frontend React (`@nocrato/web`) + nginx interno para SPA |
| `nginx.conf` | Config do Nginx reverse proxy + SSL termination para app.nocrato.com |

## Serviços (dev)

| Serviço | Imagem | Porta | Credenciais |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | `5432` | user: `nocrato` / db: `nocrato_health` / pass: `nocrato_secret` |

## Serviços (prod)

| Serviço | Imagem | Porta interna | Descrição |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | `5432` | Banco de dados principal |
| `evolution` | `atendai/evolution-api:v2.2.3` | `8080` | Gateway WhatsApp |
| `api` | build local | `3000` | NestJS backend |
| `web` | build local | `80` | React SPA (nginx estático) |
| `nginx` | `nginx:alpine` | `80`, `443` | Reverse proxy público + SSL |

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
- Evolution API entra apenas no compose prod — em dev, rodar separado se necessário
- O volume `uploads_data` é compartilhado entre `api` (escrita) e `nginx` (leitura read-only)
- Certificados Let's Encrypt são bind-mounted de `/etc/letsencrypt` do host (não volume nomeado) — o Certbot no host escreve lá, o nginx lê read-only
- A versão da Evolution API é pinada (`v2.2.3`) — atualizar conscientemente ao testar compatibilidade

## O que NÃO pertence aqui

- Configuração do NestJS (pertence a `apps/api/`)
- Variáveis de ambiente de produção (ficam no `.env` do servidor Hostinger)
- Redis, S3, ou qualquer serviço fora do escopo MVP
