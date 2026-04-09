# database/ — Knex Provider e Migrations

## O que este módulo faz

Configura e expõe a conexão PostgreSQL via Knex como um provider global NestJS. Também contém as 14 migrations SQL e os scripts de migrate/seed.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `database.module.ts` | Módulo NestJS `@Global()` que exporta o provider Knex |
| `knex.provider.ts` | Factory: cria instância Knex com config do `env`, exposta via token `KNEX` |
| `knexfile.ts` | Config para o CLI do Knex (carrega `.env` via dotenv, aponta para `/migrations`) |
| `migrate.ts` | Script standalone que roda `knex.migrate.latest()` — `pnpm migrate` |
| `seed.ts` | Script standalone que insere o agency_admin inicial — `pnpm seed` |
| `migrations/` | 14 arquivos `.ts` com SQL puro via `knex.raw()` |

## Injeção nos services

```typescript
import { Inject } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '../../database/knex.provider'

@Injectable()
export class MyService {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  async findAll(tenantId: string) {
    return this.knex('my_table').where({ tenant_id: tenantId })
  }
}
```

## Migrations — ordem e dependências

| # | Arquivo | Tabela | Depende de |
|---|---|---|---|
| 001 | `001_create_agency_members.ts` | `agency_members` | — |
| 002 | `002_create_invites.ts` | `invites` | 001 |
| 003 | `003_create_tenants.ts` | `tenants` | 002 |
| 004 | `004_create_doctors.ts` | `doctors` | 003 |
| 005 | `005_create_agent_settings.ts` | `agent_settings` | 003 |
| 006 | `006_create_patients.ts` | `patients` | 003 |
| 007 | `007_create_appointments.ts` | `appointments` | 003, 006 |
| 008 | `008_create_clinical_notes.ts` | `clinical_notes` | 003, 006, 007 |
| 009 | `009_create_documents.ts` | `documents` | 003, 006, 007 |
| 010 | `010_create_event_log.ts` | `event_log` | 003 |
| 011 | `011_create_booking_tokens.ts` | `booking_tokens` | 003 |
| 012 | `012_create_triggers.ts` | função + triggers | 001–011 |
| 013 | `013_create_conversations.ts` | `conversations` | 003, 012 |
| 014 | `014_add_booking_mode_to_agent_settings.ts` | ALTER `agent_settings` | 005 |
| 015 | `015_alter_doctors_nullable_crm.ts` | ALTER `doctors` (crm/crm_state nullable, working_hours DEFAULT NULL) | 004 |
| 016 | `016_add_evolution_instance_to_agent_settings.ts` | ALTER `agent_settings` (evolution_instance_name) | 005 |
| 017 | `017_add_refresh_token_version_to_users.ts` | ALTER `agency_members` + `doctors` (refresh_token_version) | 001, 004 |
| 018 | `018_patients_document_pgcrypto.ts` | ALTER `patients`: drop cpf, add document bytea + document_type (LGPD fase 0) | 006 |

## Como rodar

```bash
# Aplicar todas as migrations pendentes
pnpm --filter @nocrato/api migrate

# Rodar seed (idempotente — verifica se já existe)
pnpm --filter @nocrato/api seed
```

## Regras

- **Nunca editar uma migration já aplicada** — criar uma nova migration de alteração
- **Nomear seguindo o padrão**: `{NNN}_{action}_{table}.sql`
- **Atualizar `docs/database/migrations.md`** ao criar uma nova migration
- `event_log` é **append-only** — sem trigger de `updated_at` (intencional)
- `booking_tokens` não tem `updated_at` (tokens são criados e consumidos, nunca editados)

## O que NÃO pertence aqui

- Lógica de negócio (pertence aos modules/)
- Types TypeScript de domínio (pertence a packages/shared-types)
- Variáveis de ambiente em hardcode
