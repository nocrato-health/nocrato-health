# Patient Module

## Responsabilidade

Gestão de pacientes no portal do doutor. Permite listar, buscar e filtrar pacientes
vinculados ao tenant do doutor autenticado. Dados sensíveis (cpf, portal_access_code)
nunca são expostos nas respostas da API.

## Endpoints expostos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/doctor/patients` | Listagem paginada com busca por nome/telefone e filtro por status |

## Arquivos principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `patient.module.ts` | Registra controller e service; não reimporta DatabaseModule (é `@Global()`) |
| `patient.controller.ts` | Handlers HTTP; extrai tenantId do JWT via `@TenantId()` |
| `patient.service.ts` | Queries Knex para listagem paginada e busca de pacientes |
| `dto/list-patients.dto.ts` | Zod schema para query params de listagem (page, limit, search, status) |
| `patient.service.spec.ts` | Testes unitários do PatientService — mock manual do Knex |
| `patient.controller.spec.ts` | Testes unitários do PatientController |

## Tabelas envolvidas

- `patients` — todos os campos, scoped por `tenant_id`

## Campos públicos (expostos na listagem)

`id`, `name`, `phone`, `email`, `source`, `status`, `created_at`

## Campos NUNCA expostos

- `portal_access_code` — código de acesso do portal do paciente (segredo)
- `cpf` — dado sensível, protegido por LGPD

## Regras de negócio

- **Isolamento por tenantId**: toda query usa `WHERE tenant_id = tenantId`. Nunca aceitar tenantId do body.
- **tenantId extraído do JWT** via `@TenantId()` decorator.
- **Busca full-text parcial**: `search` pesquisa em `name` e `phone` com ILIKE (case-insensitive).
- **Filtro por status**: `status` pode ser `'active'` ou `'inactive'`. Se omitido, retorna todos.
- **Paginação padrão**: page=1, limit=20 (máx 100). Parâmetros HTTP são strings — usar `z.coerce.number()`.
- **Ordenação**: `created_at DESC` (mais recentes primeiro).

## Guards obrigatórios

Todos os endpoints deste módulo requerem:

```typescript
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
```

## O que NÃO pertence a este módulo

- Auth do doutor (login, refresh, invite) → `modules/auth/`
- Portal do paciente (acesso via código) → futuro `modules/patient-portal/`
- Criação de pacientes pelo agente WhatsApp → `modules/agent/`
- Consultas de pacientes → `modules/appointment/`
- Notas clínicas → `modules/clinical-note/`

## Como rodar / testar isoladamente

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=patient
```
