---
tags: [roadmap, v1, epic]
type: epic
status: completed
---

# EPIC 0: Fundacao

| Field | Value |
|-------|-------|
| **Epic** | 0 |
| **Name** | Fundacao |
| **Description** | Setup do projeto, banco de dados, e infraestrutura base do NestJS |
| **Dependencies** | None (this is the first epic) |
| **User Stories** | 3 |

---

## US-0.1: Como desenvolvedor, quero o monorepo configurado para comecar a codar ✅

- [x] Criar pasta `nocrato-health-v2/`, `git init`
- [x] package.json raiz (pnpm workspaces: `apps/*`, `packages/*`) + pnpm-workspace.yaml
- [x] turbo.json (build, dev, lint, typecheck, test, test:e2e)
- [x] tsconfig.base.json (strict, decorators, moduleResolution: node10)
- [x] .gitignore, .nvmrc (Node 20), .env.example
- [x] docker/docker-compose.dev.yml (PostgreSQL 16, named network, healthcheck)
- [x] docker/CLAUDE.md (documentação do módulo)
- [x] `docker compose up -d` → banco rodando (PostgreSQL 16.11, healthy)
- [x] Tech-lead aprovado (após correções: EVOLUTION_WEBHOOK_TOKEN, moduleResolution, network)

---

## US-0.2: Como desenvolvedor, quero o NestJS bootstrapado com banco conectado ✅

- [x] Scaffold apps/api (NestJS 11 + TypeScript)
- [x] package.json com deps (@nestjs/core, @nestjs/common, knex, pg, zod, bcrypt, dotenv, etc.)
- [x] config/env.ts (Zod validation: DB_*, JWT_*, RESEND_API_KEY, EVOLUTION_*, OPENAI_API_KEY)
- [x] database/knex.provider.ts (Symbol KNEX + useFactory) + database.module.ts (@Global)
- [x] database/knexfile.ts, migrate.ts, seed.ts
- [x] 14 migration files TypeScript com knex.raw() (001 a 014, ordem de FK)
- [x] Rodar migrations: 14 aplicadas em batch 1, 12 tabelas de negócio criadas
- [x] Seed: admin@nocrato.com criado com senha admin123 (bcrypt round 10)
- [x] Health check: GET /health → { status: 'ok', timestamp }
- [x] CLAUDE.md criados: apps/api/, src/config/, src/database/
- [x] **Criterio:** NestJS sobe na 3000, `curl /health` → 200 OK
- [x] DBA + Tech-lead APROVADOS (3 observações não-bloqueantes logadas para epics futuros)

---

## US-0.3: Como desenvolvedor, quero guards e decorators prontos para proteger rotas ✅

- [x] common/guards/jwt-auth.guard.ts
- [x] common/guards/roles.guard.ts
- [x] common/guards/tenant.guard.ts
- [x] ~~common/guards/api-key.guard.ts~~ (removido -- agente e interno, sem webhook externo autenticado por API key)
- [x] common/decorators/roles.decorator.ts (@Roles)
- [x] common/decorators/current-user.decorator.ts (@CurrentUser)
- [x] common/decorators/tenant.decorator.ts (@TenantId)
- [x] common/filters/http-exception.filter.ts
- [x] common/pipes/zod-validation.pipe.ts
- [x] modules/auth/strategies/jwt.strategy.ts (Passport)
- [x] modules/auth/auth.module.ts (PassportModule + JwtModule)
- [x] common/CLAUDE.md (documentação do módulo)
- [x] **Criterio:** Request sem token → 401, request com role errada → 403
- [x] Tech-lead: ⚠️ APROVADO COM OBSERVAÇÕES (OBS-TL-1,2,3 — não bloqueantes, endereçar antes do deploy)
- [x] QA: ✅ APROVADO — 12/12 cenários passaram (401, 403, 200, shape de erros)

---

## Links Relacionados

- [[architecture/decisions|ADRs]]
- [[database/migrations|Migrations]]

