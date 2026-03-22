---
tags: [roadmap, v1, test-cases]
type: test-cases
---

# Casos de Teste — Epic 9: Agente WhatsApp (Modulo Interno NestJS)

> Epic doc: [docs/roadmap/epic-9-events.md](../roadmap/epic-9-events.md)
> Gerado em: 2026-03-07

---

## US-9.1 — Registrar eventos internos e reagir a eles

### CT-91-01 — Cancelamento de consulta emite evento e registra no event_log

**Categoria:** Happy path

**Given** doutor autenticado, paciente com consulta `scheduled`, telefone `(11) 98765-4321`
**When** PATCH `/api/v1/doctor/appointments/:id/status` `{ status: "cancelled", reason: "Médico indisponível" }`
**Then** status atualizado para `cancelled`, evento `appointment.cancelled` emitido com payload `{ tenantId, phone, dateTime, doctorName, reason }`, e evento `appointment.status_changed` registrado no `event_log`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-91-02 — Mudança de status para `waiting` emite `appointment.status_changed`

**Categoria:** Happy path

**Given** doutor autenticado, consulta com status `scheduled`
**When** PATCH `/api/v1/doctor/appointments/:id/status` `{ status: "waiting" }`
**Then** evento `appointment.status_changed` emitido com `{ oldStatus: "scheduled", newStatus: "waiting" }` e entrada gerada no `event_log`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-91-03 — Ativacao do portal do paciente emite `patient.portal_activated`

**Categoria:** Happy path

**Given** paciente `Joao Silva` com `portal_active = false`, telefone `(11) 91234-5678`
**When** `appointment.service.ts` completa a primeira consulta do paciente (status muda para `completed`) e chama `patientService.activatePortal()`
**Then** evento `patient.portal_activated` emitido com `{ tenantId, phone, portalAccessCode }` e entrada gerada no `event_log`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-91-04 — event_log e append-only (sem updates)

**Categoria:** Edge case

**Given** uma entrada existente no `event_log`
**When** qualquer acao do sistema gera um novo evento para o mesmo recurso
**Then** nova linha e inserida no `event_log` (INSERT) — nenhuma linha existente e modificada (sem UPDATE)

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-91-05 — Evento nao emitido para mudancas de status sem telefone de paciente

**Categoria:** Edge case

**Given** consulta sem paciente vinculado ou paciente sem telefone cadastrado
**When** status da consulta e alterado
**Then** `event_log` registra a mudanca normalmente, mas nenhuma notificacao WhatsApp e tentada (sem erro propagado ao chamador)

**Resultado atual:** [x] ok  [ ] falhou

---

## US-9.2 — Receber mensagens do WhatsApp via webhook

### CT-92-01 — Webhook valido dispara processamento da mensagem

**Categoria:** Happy path

**Given** servidor NestJS rodando com `EVOLUTION_WEBHOOK_TOKEN=token-secreto`
**When** POST `/api/v1/agent/webhook` com header `apikey: token-secreto` e body `{ event: "messages.upsert", data: { key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false }, message: { conversation: "Quero agendar uma consulta" }, pushName: "Joao Santos" } }`
**Then** HTTP 200, `agentService.handleMessage()` e chamado com o payload completo

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-92-02 — Webhook com apikey invalida retorna 401

**Categoria:** Acesso negado

**Given** servidor rodando com `EVOLUTION_WEBHOOK_TOKEN=token-secreto`
**When** POST `/api/v1/agent/webhook` com header `apikey: token-errado`
**Then** HTTP 401 Unauthorized — nenhuma mensagem processada

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-92-03 — Mensagem `fromMe=true` e ignorada silenciosamente

**Categoria:** Edge case

**Given** webhook valido recebido
**When** body contem `data.key.fromMe = true` (mensagem enviada pelo proprio agente)
**Then** HTTP 200 retornado, `agentService.handleMessage()` NAO e chamado — sem loop

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-92-04 — Webhook sem header apikey retorna 401

**Categoria:** Acesso negado

**Given** servidor rodando
**When** POST `/api/v1/agent/webhook` sem header `apikey`
**Then** HTTP 401 Unauthorized

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-92-05 — Evento diferente de `messages.upsert` nao processa mensagem

**Categoria:** Edge case

**Given** webhook valido recebido
**When** body contem `event: "connection.update"` (evento de status de conexao)
**Then** HTTP 200 retornado sem processamento de mensagem (nao chama `handleMessage`)

**Resultado atual:** [ ] ok  [ ] falhou

---

## ✅ US-9.3 — Processar mensagens com LLM e executar acoes

### CT-93-01 — Mensagem de texto simples recebe resposta do LLM

**Categoria:** Happy path

**Given** paciente `Ana Lima`, telefone `5511988887777`, ja cadastrado no tenant `dr-silva`; conversa existente com 3 mensagens previas
**When** webhook valido recebido com mensagem `"Qual o horario de funcionamento?"`
**Then** LLM chamado com system prompt + historico + mensagem atual; resposta de texto enviada via `whatsappService.sendText()`; historico da conversa atualizado no banco

**Resultado atual:** [x] ok

---

### CT-93-02 — Solicitacao de agendamento dispara tool `list_slots` e `book_appointment`

**Categoria:** Happy path

**Given** paciente `Carlos Mendes` sem consulta futura; working_hours configurado com quinta-feira disponivel
**When** conversa progride: `"Quero agendar para quinta"` → LLM chama `list_slots` → resposta com slots → `"09:00 por favor"` → LLM chama `book_appointment`
**Then** `bookingService.bookInChat()` chamado com `{ tenantId, phone, name: "Carlos Mendes", dateTime: "YYYY-MM-DDT09:00:00" }`; evento `appointment.created` emitido; LLM envia confirmacao via WhatsApp

**Passos detalhados:**
1. Primeira mensagem chega: `"Quero agendar para quinta-feira"`
2. LLM detecta intencao de agendamento, chama `list_slots({ date: "YYYY-MM-DD" })`
3. `bookingService.getSlots()` retorna slots disponíveis
4. LLM formata resposta com horarios e envia via WhatsApp
5. Paciente responde: `"09:00 por favor"`
6. LLM chama `book_appointment({ dateTime: "...", patientName: "Carlos Mendes" })`
7. `bookingService.bookInChat()` cria consulta + findOrCreate patient
8. LLM envia mensagem de confirmacao

**Resultado atual:** [x] ok

---

### CT-93-03 — Tool `generate_booking_link` gera link e envia ao paciente

**Categoria:** Happy path

**Given** tenant configurado com `booking_mode: "link"`, paciente `Patricia Rocha` no WhatsApp
**When** LLM decide usar `generate_booking_link()` em vez de agendar in-chat
**Then** `bookingService.generateToken(tenantId, phone)` chamado; URL retornada no formato `https://{FRONTEND_URL}/book/{slug}?token={token64chars}`; mensagem com link enviada ao paciente

**Resultado atual:** [x] ok

---

### CT-93-04 — Tool `cancel_appointment` cancela consulta existente

**Categoria:** Happy path

**Given** paciente com consulta `scheduled` com id `uuid-123`; paciente solicita cancelamento via WhatsApp
**When** LLM chama `cancel_appointment({ appointmentId: "uuid-123", reason: "Paciente solicitou" })`
**Then** `appointmentService.cancel()` chamado; consulta com status `cancelled` no banco; evento `appointment.cancelled` emitido; LLM confirma cancelamento ao paciente

**Resultado atual:** [x] ok

---

### CT-93-05 — Novo paciente recebe contexto "sem registro" no system prompt

**Categoria:** Edge case

**Given** telefone `5511977776666` sem nenhum paciente cadastrado no tenant
**When** mensagem recebida via webhook
**Then** LLM chamado com system prompt contendo `"Este e um novo paciente (sem registro ainda)"` — sem erro; conversa criada no banco via `conversationService.getOrCreate()`

**Resultado atual:** [x] ok

---

### CT-93-06 — Historico de conversa e truncado apos 20 mensagens

**Categoria:** Edge case

**Given** conversa com 22 mensagens armazenadas no JSONB `messages`
**When** nova mensagem recebida e processada
**Then** LLM recebe apenas as ultimas 20 mensagens no historico; banco armazena ultimas 20 mensagens (mais antigas descartadas)

**Resultado atual:** [x] ok

---

### CT-93-07 — Tenant resolvido pelo numero da instancia Evolution (isolamento)

**Categoria:** Isolamento

**Given** dois tenants: `dr-silva` e `dra-carvalho`, cada um com instancia Evolution separada
**When** mensagem chega na instancia de `dr-silva`
**Then** `agentService.handleMessage()` resolve `tenantId` de `dr-silva` exclusivamente; slots, historico e paciente sao do tenant correto — dados de `dra-carvalho` nunca acessados

**Resultado atual:** [x] ok

---

## US-9.4 — Notificar pacientes sobre eventos do portal

### CT-94-01 — Cancelamento de consulta notifica paciente via WhatsApp

**Categoria:** Happy path

**Given** paciente `Roberto Alves`, telefone `5511966665555`, consulta agendada para `2026-03-15 14:00`
**When** doutor cancela a consulta via PATCH `/api/v1/doctor/appointments/:id/status` `{ status: "cancelled", reason: "Emergencia medica" }`
**Then** evento `appointment.cancelled` recebido pelo `@OnEvent` no `AgentService`; `whatsappService.sendText()` chamado com mensagem contendo data da consulta e motivo

**Resultado atual:** [x] ok

---

### CT-94-02 — Ativacao do portal envia codigo de acesso ao paciente

**Categoria:** Happy path

**Given** paciente `Fernanda Costa`, telefone `5511955554444`, `portal_active = false`, `portal_access_code = "XK9P2M"`
**When** evento `patient.portal_activated` emitido (primeira consulta completada)
**Then** `@OnEvent('patient.portal_activated')` recebe payload; `whatsappService.sendText()` chamado com mensagem contendo o codigo `XK9P2M` e URL do portal

**Resultado atual:** [x] ok

---

### CT-94-03 — Status `waiting` notifica paciente para ir a recepcao

**Categoria:** Happy path

**Given** paciente `Marcos Oliveira`, telefone `5511944443333`, consulta com status `scheduled`
**When** doutor muda status para `waiting` via PATCH `.../status` `{ status: "waiting" }`
**Then** `@OnEvent('appointment.status_changed')` recebe payload com `newStatus: "waiting"`; mensagem enviada ao paciente: `"O consultorio esta pronto para te receber! Por favor, dirija-se a recepcao."`

**Resultado atual:** [x] ok

---

### CT-94-04 — Novo agendamento dispara confirmacao imediata ao paciente

**Categoria:** Happy path

**Given** paciente `Luciana Ferreira`, telefone `5511933332222`
**When** agendamento criado via booking publico ou in-chat, evento `appointment.created` emitido com `{ patientName, dateTime, phone }`
**Then** `@OnEvent('appointment.created')` recebe payload; mensagem de confirmacao enviada ao paciente com nome e data formatada

**Resultado atual:** [x] ok

---

### CT-94-05 — Status diferente de `waiting` nao gera notificacao

**Categoria:** Edge case

**Given** consulta com status `scheduled`
**When** doutor muda status para `in_progress`
**Then** `@OnEvent('appointment.status_changed')` e chamado com `newStatus: "in_progress"`; nenhuma mensagem WhatsApp enviada (handler so age para `waiting`)

**Resultado atual:** [x] ok

---

### CT-94-06 — Falha no envio WhatsApp nao propaga excecao para o handler de evento

**Categoria:** Edge case

**Given** `whatsappService.sendText()` configurado para lancar erro (Evolution API indisponivel)
**When** evento `appointment.cancelled` e emitido e handler tenta enviar mensagem
**Then** erro e logado internamente; nenhuma excecao propagada que quebre a transacao original ou o processo NestJS

**Resultado atual:** [x] ok