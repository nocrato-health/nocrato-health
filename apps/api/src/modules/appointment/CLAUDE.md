# Appointment Module

## Responsabilidade

Gestão do ciclo de vida de consultas no portal do doutor. Permite listar, filtrar e
criar consultas vinculadas ao tenant do doutor autenticado. A máquina de estados de uma
consulta segue: `scheduled → waiting → in_progress → completed` (com derivações
`cancelled`, `no_show`, `rescheduled`).

## Endpoints expostos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/doctor/dashboard` | Dashboard: consultas de hoje + total pacientes + pendingFollowUps |
| GET | `/api/v1/doctor/appointments` | Listagem paginada com filtros por status, data e paciente |
| POST | `/api/v1/doctor/appointments` | Cria consulta manualmente com verificação de conflito de horário |
| GET | `/api/v1/doctor/appointments/:id` | Detalhe da consulta: appointment + patient + clinical_notes |
| PATCH | `/api/v1/doctor/appointments/:id/status` | Altera status seguindo máquina de estados; registra actor_id |

**Atenção — ordem obrigatória no controller:** `@Get('dashboard')` → `@Get(':id')` → `@Patch(':id/status')` para evitar conflito de rota NestJS.

## Arquivos principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `appointment.module.ts` | Registra controller e service; não reimporta DatabaseModule (é `@Global()`) |
| `appointment.controller.ts` | Handlers HTTP; extrai tenantId via `@TenantId()`, actorId via `@CurrentUser().sub` |
| `appointment.service.ts` | Queries Knex: dashboard, listagem, criação, detalhe, máquina de estados |
| `dto/list-appointments.dto.ts` | Zod schema para query params de listagem (page, limit, status, date, patientId); exporta `AppointmentStatusEnum` |
| `dto/create-appointment.dto.ts` | Zod schema para body de criação (patientId, dateTime, durationMinutes?) |
| `dto/update-appointment-status.dto.ts` | Zod discriminatedUnion por status alvo; campos obrigatórios por transição |
| `dto/get-dashboard.dto.ts` | Zod schema do response do dashboard (documentação — não aplicado como pipe) |
| `appointment.service.spec.ts` | Testes unitários do AppointmentService — mock manual do Knex |
| `appointment.controller.spec.ts` | Testes unitários do AppointmentController + validação do DTO |

## Tabelas envolvidas

- `appointments` — scoped por `tenant_id`
- `patients` — lido em criação (validação), detalhe (dados do paciente) e dashboard (count ativos)
- `clinical_notes` — lido em detalhe (array de notas) e dashboard (LEFT JOIN para pendingFollowUps)
- `doctors` — lido em criação (appointment_duration padrão)
- `event_log` — escrita em criação, mudança de status e portal activation

## Campos retornados na listagem (US-5.1)

`id`, `tenant_id`, `patient_id`, `date_time`, `duration_minutes`, `status`,
`cancellation_reason`, `rescheduled_to_id`, `created_by`, `started_at`,
`completed_at`, `created_at`

## Status válidos (`AppointmentStatus`)

`scheduled`, `waiting`, `in_progress`, `completed`, `cancelled`, `no_show`, `rescheduled`

## Regras de negócio

### Listagem (US-5.1)
- **Isolamento por tenantId**: toda query usa `WHERE tenant_id = tenantId`. Nunca aceitar tenantId do body.
- **tenantId extraído do JWT** via `@TenantId()` decorator.
- **Filtro por status**: enum dos 7 valores válidos. Se omitido, retorna todos.
- **Filtro por date (YYYY-MM-DD)**: converte para range UTC [início do dia, fim do dia] usando `BETWEEN`.
- **Filtro por patientId**: UUID do paciente. Se omitido, retorna consultas de todos os pacientes.
- **Paginação padrão**: page=1, limit=20 (máx 100). Parâmetros HTTP são strings — usar `z.coerce.number()`.
- **Ordenação**: `date_time DESC` (mais recentes primeiro).
- **count e data em paralelo**: executar `Promise.all([count clone, data clone])` para eficiência.
- **Knex count retorna string do PostgreSQL**: converter com `Number()`.
- **Filtros antes dos terminais**: aplicar `.where()` antes de `limit/offset/count` (mutação in-place do builder).

### Máquina de estados (US-5.3)

- **Endpoint:** `PATCH /api/v1/doctor/appointments/:id/status`
- **DTO:** `UpdateAppointmentStatusSchema` (Zod `discriminatedUnion` por `status`)
- **VALID_TRANSITIONS:** `scheduled → [waiting, cancelled, no_show, rescheduled]`, `waiting → [in_progress, cancelled, no_show]`, `in_progress → [completed]`; demais são terminais (array vazio)
- **Transição inválida:** `BadRequestException('Transição inválida: {current} → {target}')`
- **Consulta não encontrada:** `NotFoundException('Consulta não encontrada')`
- **`→ in_progress`:** seta `started_at = knex.fn.now()`
- **`→ completed`:** seta `completed_at = knex.fn.now()`; se `patient.portal_access_code IS NULL` → gera `AAA-1234-BBB` (charset sem I/O) → UPDATE patients `{ portal_access_code, portal_active: true }` → INSERT `patient.portal_activated` no event_log
- **`→ cancelled`:** `cancellationReason` obrigatório no DTO (Zod valida)
- **`→ rescheduled`:** SELECT FOR UPDATE para conflito → cria nova consulta (`status: 'scheduled'`, `created_by: 'doctor'`) → UPDATE original `{ status: 'rescheduled', rescheduled_to_id }` → dois INSERTs no event_log (`appointment.rescheduled` + `appointment.created`); retorna `{ original, rescheduledTo }`
- **actorId:** extraído de `@CurrentUser().sub` (JWT `sub`) — registrado em `event_log.actor_id`
- **event_log:** colunas `{ tenant_id, event_type, actor_type: 'doctor', actor_id, payload }` — sem `entity_type`/`entity_id` (não existem no schema)

### Criação manual (US-5.2)
- **Paciente deve existir no mesmo tenant**: 404 `'Paciente não encontrado'` se não encontrado.
- **durationMinutes opcional**: se ausente, busca `doctors.appointment_duration` pelo tenantId; fallback 30 minutos.
- **Verificação de conflito com SELECT FOR UPDATE**: toda a lógica roda dentro de `knex.transaction()`.
- **Condição de sobreposição**: `date_time < endTime AND (date_time + duration_minutes * INTERVAL '1 minute') > startTime`.
- **Status ignorados no conflito**: `cancelled` e `completed` não bloqueiam novos agendamentos.
- **Conflito encontrado**: 409 `'Conflito de horário: paciente já possui consulta no mesmo período'`.
- **status fixo**: sempre `'scheduled'` na criação; `created_by` sempre `'doctor'`.
- **Evento de audit trail**: INSERT em `event_log` com `event_type='appointment.created'`, `actor_type='doctor'`, `payload: { appointment_id, patient_id, date_time, created_by }` — feito dentro da mesma transação. Colunas corretas: `actor_type` (não `actor`); sem `entity_type`/`entity_id` (não existem no schema).
- **Retorna 201** com os campos: `id`, `tenant_id`, `patient_id`, `date_time`, `duration_minutes`, `status`, `created_by`, `created_at`.

### Detalhe de consulta (US-5.4)

- **Endpoint:** `GET /api/v1/doctor/appointments/:id`
- **Busca:** `appointments WHERE { id, tenant_id }` → 404 `'Consulta não encontrada'` se null
- **Paralelo:** `Promise.all([patient query, clinical_notes query])`
- **Patient:** campos `APPOINTMENT_DETAIL_PATIENT_FIELDS` (exclui `document` e `portal_access_code`)
- **Paciente deletado:** `patient = undefined` não lança 404 — retorna `patient: undefined` (comportamento MVP)
- **Response:** `{ appointment, patient, clinicalNotes }`
- **OBS-TL-1 (baixo risco MVP):** `APPOINTMENT_LIST_FIELDS` reutilizado no detalhe — acoplamento implícito aceitável

### Dashboard (US-5.5)

- **Endpoint:** `GET /api/v1/doctor/dashboard`
- **Response:** `{ todayAppointments: Appointment[], totalPatients: number, pendingFollowUps: number }`
- **Paralelo:** `Promise.all` para as 3 queries
- **`todayAppointments`:** `appointments WHERE tenant_id AND date_time BETWEEN [T00:00:00.000Z, T23:59:59.999Z]` ORDER BY `date_time ASC` — usa `APPOINTMENT_LIST_FIELDS`
- **`totalPatients`:** `COUNT patients WHERE { tenant_id, status: 'active' }` — converter com `Number()`
- **`pendingFollowUps`:** `COUNT appointments as a LEFT JOIN clinical_notes as cn ON cn.appointment_id = a.id WHERE { a.tenant_id, a.status: 'completed' } AND cn.id IS NULL` — contar por CONSULTA (não por paciente), converter com `Number()`
- **Knex count retorna string do PostgreSQL:** sempre usar `Number(result?.count ?? 0)`

## Guards obrigatórios

Todos os endpoints deste módulo requerem:

```typescript
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
```

## O que NÃO pertence a este módulo

- Auth do doutor (login, refresh, invite) → `modules/auth/`
- Gestão de pacientes → `modules/patient/`
- Notas clínicas → `modules/clinical-note/`
- Documentos → `modules/document/`
- Booking público (geração de tokens) → `modules/booking/`
- Agendamento via WhatsApp → `modules/agent/`
- Cron de auto-transição `scheduled → waiting` → ficou fora do MVP de US-5.5; a implementar em US futura se necessário

## Como rodar / testar isoladamente

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=appointment
```
