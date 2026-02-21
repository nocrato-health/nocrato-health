# EPIC 0: Fundacao

| Field | Value |
|-------|-------|
| **Epic** | 0 |
| **Name** | Fundacao |
| **Description** | Setup do projeto, banco de dados, e infraestrutura base do NestJS |
| **Dependencies** | None (this is the first epic) |
| **User Stories** | 3 |

---

## US-0.1: Como desenvolvedor, quero o monorepo configurado para comecar a codar

- [ ] Criar pasta `nocrato-health-v2/`, `git init`
- [ ] package.json raiz (pnpm workspaces: `apps/*`)
- [ ] turbo.json (build, dev, lint, typecheck)
- [ ] tsconfig.base.json
- [ ] .gitignore, .nvmrc (Node 20), .env.example
- [ ] docker/docker-compose.dev.yml (PostgreSQL 16)
- [ ] `docker compose up -d` → banco rodando

---

## US-0.2: Como desenvolvedor, quero o NestJS bootstrapado com banco conectado

- [ ] Scaffold apps/api (NestJS + TypeScript)
- [ ] package.json com deps (@nestjs/core, knex, pg, zod, etc.)
- [ ] config/env.ts (Zod validation: DB_*, JWT_SECRET, RESEND_API_KEY, WEBHOOK_API_KEY)
- [ ] database/knex.provider.ts + database.module.ts (Global)
- [ ] 12 migration files (SQL puro, ordem de FK)
- [ ] Rodar migrations, verificar todas as tabelas no banco
- [ ] Seed: 1 agency_admin (email: admin@nocrato.com, senha: admin123)
- [ ] Health check: GET /health → { status: 'ok' }
- [ ] **Criterio:** `pnpm --filter @nocrato/api dev` → NestJS sobe na 3000

---

## US-0.3: Como desenvolvedor, quero guards e decorators prontos para proteger rotas

- [ ] common/guards/jwt-auth.guard.ts
- [ ] common/guards/roles.guard.ts
- [ ] common/guards/tenant.guard.ts
- [ ] ~~common/guards/api-key.guard.ts~~ (removido -- agente e interno, sem webhook externo autenticado por API key)
- [ ] common/decorators/roles.decorator.ts (@Roles)
- [ ] common/decorators/current-user.decorator.ts (@CurrentUser)
- [ ] common/decorators/tenant.decorator.ts (@TenantId)
- [ ] common/filters/http-exception.filter.ts
- [ ] common/pipes/zod-validation.pipe.ts
- [ ] auth/strategies/jwt.strategy.ts (Passport)
- [ ] **Criterio:** Request sem token → 401, request com role errada → 403
