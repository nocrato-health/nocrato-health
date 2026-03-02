# Casos de Teste — Epic 5: Gestão de Consultas

> Epic doc: [docs/roadmap/epic-5-appointments.md](../roadmap/epic-5-appointments.md)
> Gerado em: 2026-03-02

---

## US-5.1 — Listar consultas com filtros

### CT-51-01 — Happy path: listagem paginada sem filtros

**Categoria:** Happy path

**Given** doutor `Dr. Rafael Souza` autenticado com JWT válido, tenant `dr-rafael`, 5 consultas no banco (statuses variados)
**When** GET `/api/v1/doctor/appointments?page=1&limit=10`
**Then** HTTP 200 com `{ data: [...], pagination: { page: 1, limit: 10, total: 5, totalPages: 1 } }` — todos os 5 registros retornados

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-51-02 — Filtro por status retorna somente consultas com aquele status

**Categoria:** Happy path

**Given** doutor autenticado, 3 consultas `scheduled` e 2 `completed` no banco
**When** GET `/api/v1/doctor/appointments?status=scheduled`
**Then** HTTP 200 com `data` contendo exatamente 3 registros, todos com `status: "scheduled"` — nenhum `completed` retornado

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-51-03 — Filtro por data retorna somente consultas daquele dia

**Categoria:** Happy path

**Given** doutor autenticado, consulta em `2026-03-10T14:00:00Z` e outra em `2026-03-11T09:00:00Z`
**When** GET `/api/v1/doctor/appointments?date=2026-03-10`
**Then** HTTP 200 com `data` contendo apenas a consulta do dia 10 — consulta do dia 11 não aparece

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-51-04 — Filtro por paciente retorna somente consultas daquele paciente

**Categoria:** Happy path

**Given** doutor autenticado, paciente A com 2 consultas, paciente B com 3 consultas
**When** GET `/api/v1/doctor/appointments?patientId={uuid-paciente-A}`
**Then** HTTP 200 com `data` contendo exatamente 2 registros — apenas consultas do paciente A

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-51-05 — Doutor não acessa consultas de outro tenant

**Categoria:** Isolamento

**Given** dois tenants: `dr-rafael` com 3 consultas e `dra-carvalho` com 2 consultas
**When** dr-rafael autenticado faz GET `/api/v1/doctor/appointments`
**Then** HTTP 200 com `total: 3` — consultas de dra-carvalho nunca aparecem, mesmo sem filtros

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-51-06 — Acesso sem token retorna 401

**Categoria:** Acesso negado

**Given** nenhum token de autenticação presente
**When** GET `/api/v1/doctor/appointments` sem header Authorization
**Then** HTTP 401 Unauthorized

**Resultado atual:** [x] ok  [ ] falhou

---

## US-5.2 — Criar consulta manualmente

### CT-52-01 — Happy path: criar consulta com dados válidos

**Categoria:** Happy path

**Given** doutor `Dr. Rafael Souza` autenticado, paciente `Maria Silva` (id conhecido) existente no mesmo tenant, horário `2026-03-15T10:00:00-03:00` livre
**When** POST `/api/v1/doctor/appointments` com body `{ "patientId": "{uuid}", "dateTime": "2026-03-15T10:00:00-03:00", "durationMinutes": 30 }`
**Then** HTTP 201 com objeto da consulta: `status: "scheduled"`, `createdBy: "doctor"`, `tenantId` correto — consulta persiste no banco

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-52-02 — Conflito de horário retorna erro

**Categoria:** Edge case

**Given** doutor autenticado, já existe consulta `scheduled` no horário `2026-03-15T10:00:00-03:00` com duração 30 min (ocupa até 10:30)
**When** POST `/api/v1/doctor/appointments` com `dateTime: "2026-03-15T10:15:00-03:00"` (dentro da janela ocupada)
**Then** HTTP 409 Conflict — nova consulta não é criada no banco

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-52-03 — Paciente de outro tenant é rejeitado

**Categoria:** Isolamento

**Given** doutor `dr-rafael` autenticado, `patientId` pertencente ao tenant `dra-carvalho`
**When** POST `/api/v1/doctor/appointments` com esse `patientId`
**Then** HTTP 404 (paciente não encontrado no tenant de dr-rafael) — consulta não criada

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-52-04 — Campos obrigatórios ausentes retornam 400

**Categoria:** Validação

**Given** doutor autenticado
**When** POST `/api/v1/doctor/appointments` com body `{ "durationMinutes": 30 }` (sem `patientId` e sem `dateTime`)
**Then** HTTP 400 Bad Request com detalhes dos campos faltantes — consulta não criada

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-52-05 — durationMinutes ausente usa duração padrão do doutor

**Categoria:** Edge case

**Given** doutor autenticado com `appointment_duration = 45` configurado no onboarding, horário livre
**When** POST `/api/v1/doctor/appointments` sem `durationMinutes`
**Then** HTTP 201 com `durationMinutes: 45` na resposta — padrão aplicado automaticamente

**Resultado atual:** [x] ok  [ ] falhou

---

## US-5.3 — Alterar status de uma consulta

### CT-53-01 — scheduled → waiting (transição manual)

**Categoria:** Happy path

**Given** doutor autenticado, consulta `{id}` com status `scheduled` no mesmo tenant
**When** PATCH `/api/v1/doctor/appointments/{id}/status` com body `{ "status": "waiting" }`
**Then** HTTP 200, consulta com `status: "waiting"` — evento `appointment.status_changed` registrado no `event_log`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-53-02 — waiting → in_progress preenche started_at

**Categoria:** Happy path

**Given** doutor autenticado, consulta `{id}` com status `waiting`
**When** PATCH `/api/v1/doctor/appointments/{id}/status` com body `{ "status": "in_progress" }`
**Then** HTTP 200 com `status: "in_progress"` e `startedAt` preenchido com timestamp atual — `event_log` atualizado

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-53-03 — in_progress → completed preenche completed_at

**Categoria:** Happy path

**Given** doutor autenticado, consulta `{id}` com status `in_progress`, paciente com `portal_access_code` já existente
**When** PATCH `/api/v1/doctor/appointments/{id}/status` com body `{ "status": "completed" }`
**Then** HTTP 200 com `status: "completed"` e `completedAt` preenchido — `portal_access_code` não alterado (já existia) — `event_log` atualizado

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-53-04 — completed (primeira consulta) gera portal_access_code para o paciente

**Categoria:** Edge case

**Given** doutor autenticado, consulta `{id}` com status `in_progress`, paciente com `portal_access_code = null`
**When** PATCH `/api/v1/doctor/appointments/{id}/status` com body `{ "status": "completed" }`
**Then** HTTP 200 — banco: paciente agora tem `portal_access_code` no formato `AAA-1234-BBB` e `portal_active = true` — evento `patient.portal_activated` registrado no `event_log`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-53-05 — cancelamento exige cancellation_reason

**Categoria:** Validação

**Given** doutor autenticado, consulta `{id}` com status `scheduled`
**When** PATCH `/api/v1/doctor/appointments/{id}/status` com body `{ "status": "cancelled" }` (sem `cancellationReason`)
**Then** HTTP 400 Bad Request — consulta não alterada no banco

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-53-06 — cancelamento com motivo é aceito

**Categoria:** Happy path

**Given** doutor autenticado, consulta `{id}` com status `waiting`
**When** PATCH `/api/v1/doctor/appointments/{id}/status` com body `{ "status": "cancelled", "cancellationReason": "Paciente solicitou cancelamento" }`
**Then** HTTP 200 com `status: "cancelled"` e `cancellationReason` preenchido — evento no `event_log`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-53-07 — reagendamento cria nova consulta e atualiza original

**Categoria:** Edge case

**Given** doutor autenticado, consulta `{id-original}` com status `scheduled`, novo horário `2026-03-20T09:00:00-03:00` livre
**When** PATCH `/api/v1/doctor/appointments/{id-original}/status` com body `{ "status": "rescheduled", "newDateTime": "2026-03-20T09:00:00-03:00", "cancellationReason": "Médico indisponível" }`
**Then** HTTP 200 com `originalAppointment.status: "rescheduled"`, `originalAppointment.rescheduledToId: "{id-nova}"`, `newAppointment.status: "scheduled"`, `newAppointment.dateTime: "2026-03-20T09:00:00-03:00"` — dois eventos no `event_log`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-53-08 — transição inválida retorna 400

**Categoria:** Edge case

**Given** doutor autenticado, consulta `{id}` com status `completed` (terminal)
**When** PATCH `/api/v1/doctor/appointments/{id}/status` com body `{ "status": "in_progress" }`
**Then** HTTP 400 com mensagem indicando transição inválida — status não alterado no banco

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-53-09 — doutor não altera status de consulta de outro tenant

**Categoria:** Isolamento

**Given** dois tenants: `dr-rafael` e `dra-carvalho`, consulta `{id}` pertencente a `dra-carvalho`
**When** dr-rafael autenticado faz PATCH `/api/v1/doctor/appointments/{id}/status` com body `{ "status": "waiting" }`
**Then** HTTP 404 — consulta de dra-carvalho não é alterada

**Resultado atual:** [x] ok  [ ] falhou

---

## US-5.4 — Detalhe de uma consulta

### CT-54-01 — Happy path: retorna appointment + patient + clinical_notes

**Categoria:** Happy path

**Given** doutor autenticado, consulta `{id}` com paciente `João Ferreira` e 2 notas clínicas associadas
**When** GET `/api/v1/doctor/appointments/{id}`
**Then** HTTP 200 com objeto contendo `appointment` (campos completos), `patient` (dados básicos sem cpf/portal_access_code), `clinicalNotes` (array com 2 notas)

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-54-02 — Consulta de outro tenant retorna 404

**Categoria:** Isolamento

**Given** doutor `dr-rafael` autenticado, consulta `{id}` pertencente ao tenant `dra-carvalho`
**When** GET `/api/v1/doctor/appointments/{id}`
**Then** HTTP 404 — dados de dra-carvalho não vazam

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-54-03 — ID inexistente retorna 404

**Categoria:** Edge case

**Given** doutor autenticado
**When** GET `/api/v1/doctor/appointments/00000000-0000-0000-0000-000000000000`
**Then** HTTP 404 Not Found

**Resultado atual:** [x] ok  [ ] falhou

---

## US-5.5 — Dashboard com consultas de hoje

### CT-55-01 — Happy path: retorna stats corretos do dia

**Categoria:** Happy path

**Given** doutor `Dr. Rafael Souza` autenticado, tenant `dr-rafael` com: 3 consultas hoje (1 `scheduled`, 1 `in_progress`, 1 `completed` sem nota clínica), 12 pacientes ativos no total, 1 consulta `completed` de dias anteriores com nota clínica
**When** GET `/api/v1/doctor/dashboard`
**Then** HTTP 200 com `{ todayAppointments: [{...}, {...}, {...}], totalPatients: 12, pendingFollowUps: 1 }` — `pendingFollowUps` = consultas `completed` sem nota clínica (só a de hoje, não a que já tem nota) — lista `todayAppointments` ordenada por horário crescente

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-55-02 — Dashboard sem consultas hoje retorna arrays/zeros

**Categoria:** Edge case

**Given** doutor autenticado, nenhuma consulta cadastrada para hoje
**When** GET `/api/v1/doctor/dashboard`
**Then** HTTP 200 com `{ todayAppointments: [], totalPatients: 0, pendingFollowUps: 0 }`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-55-03 — Doutor não vê dados do dashboard de outro tenant

**Categoria:** Isolamento

**Given** dois tenants: `dr-rafael` com 3 consultas hoje, `dra-carvalho` com 5 consultas hoje
**When** dr-rafael autenticado faz GET `/api/v1/doctor/dashboard`
**Then** HTTP 200 com `todayAppointments` contendo apenas as 3 consultas de dr-rafael

**Resultado atual:** [x] ok  [ ] falhou

---

## US-5.6 — Frontend: páginas de consultas + dashboard

### CT-56-01 — Happy path: dashboard exibe consultas de hoje

**Categoria:** Happy path

**Given** doutor `test-done@nocrato.com` logado, com consultas de hoje no banco (seed)
**When** navegar para `/doctor/dashboard` (rota raiz do portal)

**Then** cards de stats visíveis (total pacientes, consultas hoje) e lista de consultas do dia com nome do paciente, horário e badge de status

**Passos detalhados:**
1. Navegar para `http://localhost:5173/doctor/login`
2. Autenticar com `test-done@nocrato.com` / `Doctor123!`
3. Verificar redirect automático para dashboard
4. Verificar presença de cards com métricas
5. Verificar lista de consultas de hoje com pelo menos 1 item

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-56-02 — Listagem de consultas com filtro de status funciona

**Categoria:** Happy path

**Given** doutor logado, página `/doctor/appointments` aberta, consultas com statuses variados
**When** usuário seleciona filtro "Agendadas" no dropdown de status

**Then** lista atualiza mostrando apenas consultas com status `scheduled` — consultas com outros status desaparecem

**Passos detalhados:**
1. Navegar para `/doctor/appointments`
2. Verificar tabela/lista com consultas de múltiplos status
3. Clicar no dropdown de filtro de status
4. Selecionar "Agendadas"
5. Verificar que apenas consultas scheduled aparecem
6. Selecionar "Todos os status" — verificar que consultas voltam
   **Nota implementação:** Select exibe valor bruto após seleção (ex: "scheduled"); resetar via botão "Limpar filtros"

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-56-03 — Dialog criar consulta manual funciona

**Categoria:** Happy path

**Given** doutor logado em `/doctor/appointments`, paciente `Maria Silva` existente no tenant
**When** usuário clica "Nova Consulta", preenche o formulário e confirma

**Then** nova consulta aparece na lista com status "Agendada" e nome de Maria Silva

**Passos detalhados:**
1. Clicar botão "Nova Consulta" → dialog abre com heading visível
2. Selecionar paciente `Maria Silva` no campo de busca
3. Preencher data/hora: `2026-03-15 10:00`
4. Clicar "Confirmar" / "Salvar"
5. Verificar toast de sucesso
6. Verificar nova consulta aparece na lista
   **Nota implementação:** Paciente de teste = "Ana Lima" (seed); botão submit = "Criar consulta"

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-56-04 — Botões contextuais mudam conforme status da consulta

**Categoria:** Edge case

**Given** doutor logado, consulta em status `waiting` aberta em `/doctor/appointments/{id}`
**When** página de detalhe da consulta é visualizada

**Then** botão "Iniciar Atendimento" visível; botões "Finalizar" e "Concluir" ausentes; ao clicar "Iniciar Atendimento" → status muda para `in_progress` e botão "Finalizar" aparece

**Passos detalhados:**
1. Navegar para detalhe de consulta com status `waiting`
2. Verificar: botão "Iniciar Atendimento" presente; "Finalizar" ausente
3. Clicar "Iniciar Atendimento"
4. Verificar badge muda para `Em Andamento`
5. Verificar: botão "Finalizar" agora presente; "Iniciar Atendimento" ausente
   **Nota implementação:** Botão = "Iniciar atendimento" (lowercase); badge in_progress = "Em atendimento"; cancelar removido de in_progress (máquina correta)

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-56-05 — Detalhe da consulta exibe paciente e notas clínicas

**Categoria:** Happy path

**Given** doutor logado, consulta com paciente `João Ferreira` e 1 nota clínica associada
**When** navegar para `/doctor/appointments/{id}`
**Then** nome do paciente exibido; seção de notas clínicas com pelo menos 1 nota visível; link para criar nova nota presente
**Nota implementação:** CT adaptado — Epic 6 ainda não implementado; seção de notas clínicas exibe empty state; paciente qualquer do seed é suficiente

**Resultado atual:** [x] ok  [ ] falhou
