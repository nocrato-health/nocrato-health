# CLAUDE.md — Módulo auth

## Responsabilidade

Autenticação e emissão de JWT para os dois domínios separados da plataforma: **agency** (membros internos da Nocrato) e **doctor** (médicos com portal próprio).

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `agency-auth.service.ts` | Login, forgot/reset password, refresh token de agency_member |
| `agency-auth.controller.ts` | `POST /api/v1/agency/auth/{login,forgot-password,reset-password,refresh}` |
| `doctor-auth.service.ts` | Resolve email, login, invite acceptance, forgot/reset password, refresh token de doctor |
| `doctor-auth.controller.ts` | `GET /api/v1/doctor/auth/{invite/:token,resolve-email/:email}` e `POST /api/v1/doctor/auth/{login,accept-invite,forgot-password,reset-password,refresh}` |
| `strategies/jwt.strategy.ts` | Passport JWT strategy (valida Bearer token, extrai payload) |
| `dto/` | Zod schemas: `agency-login`, `doctor-login`, `accept-doctor-invite`, `forgot-password`, `reset-password`, `refresh-token` |
| `auth.module.ts` | Registra PassportModule, JwtModule, EmailModule, providers e controllers |

## JwtPayload

```typescript
interface JwtPayload {
  sub: string          // ID do usuário (agency_member.id ou doctor.id)
  type: 'agency' | 'doctor'
  role: 'agency_admin' | 'agency_member' | 'doctor'
  tenantId?: string    // Preenchido apenas para doctores
}
```

## Regras de negócio

- **Agency JWT**: `{ sub, type: 'agency', role }` — sem tenantId. Acesso a rotas `/api/v1/agency/...`
- **Doctor JWT**: `{ sub, type: 'doctor', role: 'doctor', tenantId }` — tenantId obrigatório para isolamento de tenant
- Access token: 15m (`JWT_SECRET`), Refresh token: 7d (`JWT_REFRESH_SECRET`)
- Nunca misturar guards de agency com rotas de doctor (domínios separados)
- `crm` e `crm_state` são nullable no momento do invite acceptance — preenchidos no onboarding (Epic 3)
- A transação de `acceptDoctorInvite` cria 3 registros atomicamente: `tenants` → `doctors` → `agent_settings`

## Padrões adotados

- Injeção de `Knex` via `@Inject(KNEX)` (sem repositórios — Knex direto, padrão do projeto)
- Validação de body com `ZodValidationPipe` aplicada por parâmetro
- Rotas públicas (login, invite) não têm guards
- Rotas protegidas usam `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`

## O que NÃO pertence a este módulo

- Lógica de convite (gerar token, enviar email) → `modules/invite/`
- Configurações do agente → `modules/agent/`
- Gestão de perfil do doutor após onboarding → futuro `modules/doctor/`

## Como testar isoladamente

```bash
# Rodar testes do módulo auth
pnpm --filter @nocrato/api test -- --testPathPattern=auth

# Rodar apenas doctor-auth.service.spec.ts (quando existir)
pnpm --filter @nocrato/api test -- --testPathPattern=doctor-auth
```
