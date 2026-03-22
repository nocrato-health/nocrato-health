---
tags: [roadmap, v1, epic]
type: epic
status: completed
---

# EPIC 5: Gestao de Consultas

| Field | Value |
|-------|-------|
| **Epic** | 5 |
| **Name** | Gestao de Consultas |
| **Description** | CRUD de consultas com lifecycle de status |
| **Dependencies** | EPIC 3 (Onboarding do Doutor) |
| **User Stories** | 6 |

> **Casos de teste:** [[test-cases/epic-5|Test Cases — Epic 5]]

---

## ✅ US-5.1: Como doutor, quero ver minhas consultas (com filtros)

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/appointments?status=scheduled&date=2024-01-15&page=1
- [x] Filtros: status, data, paciente
- [x] **Criterio:** Listagem com filtros funcionais

---

## ✅ US-5.2: Como doutor, quero criar uma consulta manualmente

**Agentes:** `backend` + `dba` → `tech-lead` → `qa`

- [x] POST /api/v1/doctor/appointments { patientId, dateTime, durationMinutes? }
- [x] created_by = 'doctor', status = 'scheduled'
- [x] Verifica conflito de horario (SELECT FOR UPDATE)
- [x] **Criterio:** Consulta criada, conflito detectado se horario ocupado

---

## ✅ US-5.3: Como doutor, quero alterar o status de uma consulta

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] PATCH /api/v1/doctor/appointments/:id/status { status }
- [x] Transicoes validas:
  - scheduled → waiting (auto ou manual)
  - waiting → in_progress (doutor inicia)
  - in_progress → completed (doutor finaliza)
  - scheduled|waiting → cancelled (com motivo)
  - scheduled|waiting → no_show
  - scheduled → rescheduled (cria nova consulta)
- [x] started_at e completed_at preenchidos automaticamente
- [x] Se completed: gera portal_access_code pro paciente (se primeiro atendimento)
- [x] Emite evento no event_log
- [x] **Criterio:** Todas transicoes validas funcionam, invalidas retornam 400

---

## ✅ US-5.4: Como doutor, quero ver o detalhe de uma consulta

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/appointments/:id → appointment + patient + notes
- [x] Promise.all para patient + clinical_notes em paralelo
- [x] patient sem cpf/portal_access_code; appointment sem agent_summary
- [x] 404 se consulta não encontrada ou tenant_id incorreto
- [x] **Criterio:** Retorna dados completos

---

## ✅ US-5.5: Como doutor, quero ver meu dashboard com consultas de hoje

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/dashboard → { todayAppointments, totalPatients, pendingFollowUps }
- [x] `todayAppointments`: consultas do dia atual (UTC) ordenadas por `date_time` ASC — campos de `APPOINTMENT_LIST_FIELDS`
- [x] `totalPatients`: COUNT de pacientes com `status = 'active'` no tenant
- [x] `pendingFollowUps`: COUNT de consultas com `status = 'completed'` que NÃO possuem nenhuma nota clínica (`clinical_notes.appointment_id` NULL via LEFT JOIN)
- [x] Todas as queries com `tenant_id` do JWT (isolamento de tenant)
- [x] Execução em `Promise.all` (paralelo)
- [x] **Criterio:** Stats corretos do dia, pendingFollowUps = número de consultas completed sem nota

---

## ✅ US-5.6: [FRONTEND] Paginas de consultas + dashboard

**Agentes:** `frontend` → `designer` → `tech-lead` → `qa`

- [x] routes/doctor/dashboard.tsx (dashboard: 3 cards + lista consultas de hoje + refetch 30s)
- [x] routes/doctor/appointments/index.tsx (lista + filtros status/data + Select customizado + paginação)
- [x] routes/doctor/appointments/$appointmentId.tsx (detalhe + botoes de acao por status)
  - [x] Botões contextuais: "Chamar paciente", "Iniciar atendimento", "Finalizar consulta", "Cancelar", "Não compareceu", "Reagendar"
  - [x] Machine de estados: scheduled→waiting→in_progress→completed (terminais: cancelled, no_show, rescheduled)
  - [x] Seção de notas clínicas (empty state — Epic 6 implementa criação)
- [x] Dialog para criar consulta manual (busca paciente por nome + data/hora + duração)
- [x] lib/queries/appointments.ts (dashboardQueryOptions, appointmentsQueryOptions, appointmentDetailQueryOptions, patientsSearchQueryOptions, useCreateAppointment, useUpdateAppointmentStatus)
- [x] types/api.ts (AppointmentStatus, Appointment, DoctorDashboardStats, AppointmentDetail)
- [x] Débito OBS-TL-2 resolvido: formatDate/formatDateTime extraídas para lib/utils.ts
- [x] Bug fix: URL dashboard corrigida para /api/v1/doctor/appointments/dashboard
- [x] Link "Consultas" adicionado ao sidebar (_layout.tsx)
- [x] Seed atualizado com appointment de HOJE (dinâmico com new Date())
- [x] 5/5 testes Playwright passando (CT-56-01 a CT-56-05)
- [x] **Criterio:** Fluxo completo de consulta no browser — QA aprovado

---

## Links Relacionados

- [[flows/appointment-lifecycle|Lifecycle de Consultas]]
- [[architecture/decisions|ADRs]]
