# apps/api — NestJS Backend

## O que este app faz

Backend REST API do Nocrato Health V2. Serve os portais da agência, do doutor, do paciente e o agente WhatsApp interno. Roda na porta 3000.

## Estrutura de diretórios

```
src/
├── main.ts                  # Bootstrap: valida env, cria app NestJS, sobe na porta 3000
├── app.module.ts            # Módulo raiz — importa todos os módulos de feature
├── config/
│   └── env.ts               # Validação Zod de todas as variáveis de ambiente
├── database/
│   ├── database.module.ts   # Provider Knex como módulo global
│   ├── knex.provider.ts     # Factory do Knex com token de injeção KNEX
│   ├── knexfile.ts          # Config para o CLI do Knex (migrate/rollback)
│   ├── migrate.ts           # Script standalone: pnpm migrate
│   ├── seed.ts              # Script standalone: pnpm seed
│   └── migrations/          # 20 migrations SQL (001 a 020)
├── common/                  # Guards, decorators, filters, pipes (Epic 0 - US-0.3)
└── modules/
    ├── health/              # GET /health — verifica DB + retorna status
    ├── auth/                # Login agency + doctor, refresh token (Epic 1)
    ├── invite/              # Convites polymórficos agency/doctor (Epic 1)
    ├── agency/              # Portal da agência (Epic 2)
    ├── tenant/              # CRUD de tenants (Epic 2)
    ├── doctor/              # Portal do doutor (Epic 3+)
    ├── patient/             # CRUD de pacientes + portal (Epic 4)
    ├── appointment/         # Lifecycle de consultas (Epic 5)
    ├── clinical-note/       # Notas clínicas (Epic 6)
    ├── document/            # Upload de documentos (Epic 6)
    ├── booking/             # Booking público + geração de tokens (Epic 7)
    ├── agent-settings/      # Config do agente WhatsApp (Epic 8)
    ├── event-log/           # Audit trail append-only (Epic 9)
    ├── upload/              # Upload multipart para disco local (Epic 6)
    └── agent/               # Módulo agente WhatsApp + Meta Cloud API (Epic 9)
```

## Regras críticas

- **Tenant isolation**: toda query em tabela tenant-scoped deve ter `WHERE tenant_id = ?`
- **Injeção Knex**: usar `@Inject(KNEX) private knex: Knex` nos services
- **Auth separada**: agency e doctor têm domínios de auth distintos, nunca misturar guards
- **Env validada no startup**: `main.ts` importa `config/env` antes do NestJS — falha rápido se env inválida

## Convenções de rota

| Prefixo | Auth | Descrição |
|---|---|---|
| `/api/v1/agency/auth/*` | Public | Login/invite agência |
| `/api/v1/agency/*` | JWT + agency role | Portal agência |
| `/api/v1/doctor/auth/*` | Public | Login/invite doutor |
| `/api/v1/doctor/*` | JWT + doctor role | Portal doutor |
| `/api/v1/public/booking/*` | Token-based | Booking público |
| `/api/v1/patient/portal/*` | Access code | Portal paciente |
| `/api/v1/agent/webhook/cloud` | Meta Cloud API (HMAC-SHA256) | Webhook WhatsApp |
| `/health` | Public | Health check |

## Como rodar

```bash
# Desenvolvimento (watch mode)
pnpm --filter @nocrato/api dev

# Migrations
pnpm --filter @nocrato/api migrate

# Seed (primeiro agency_admin)
pnpm --filter @nocrato/api seed

# Testes
pnpm --filter @nocrato/api test
pnpm --filter @nocrato/api test:e2e

# Typecheck
pnpm --filter @nocrato/api typecheck
```

## O que NÃO pertence aqui

- Frontend React (pertence a `apps/web/`)
- Tipos compartilhados (pertence a `packages/shared-types/` — a criar)
- Configuração Docker (pertence a `docker/`)
- Variáveis de ambiente reais (ficam no `.env`, nunca commitadas)
