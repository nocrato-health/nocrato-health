# EPIC 7: Agendamento Publico (Booking)

| Field | Value |
|-------|-------|
| **Epic** | 7 |
| **Name** | Agendamento Publico (Booking) |
| **Description** | Pagina de agendamento para pacientes + booking in-chat via agente interno |
| **Dependencies** | EPIC 5 (Gestao de Consultas) |
| **User Stories** | 5 |

> **Casos de teste:** [docs/test-cases/epic-7.md](../test-cases/epic-7.md)

---

## ✅ US-7.1: Como agente interno, quero gerar um token de booking para enviar ao paciente

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] `bookingService.generateToken(tenantId, phone?)` (chamada interna de servico)
- [x] Gera token (24h), salva em booking_tokens
- [x] Retorna { token, expiresAt, bookingUrl }
- [x] **Criterio:** Token gerado, valido por 24h, chamavel pelo agent.service

---

## ✅ US-7.2: Como paciente, quero ver horarios disponiveis do doutor

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] `booking.controller.ts` → `GET /api/v1/public/booking/:slug/validate?token=X` — valida token + retorna dados do médico (`{ valid, doctor: { name, specialty }, tenant: { name, primaryColor, logoUrl } }`)
- [x] GET /api/v1/public/booking/:slug/slots?date=2024-01-15&token=X
- [x] Valida token, calcula slots (working_hours - appointments existentes)
- [x] Retorna [{ start: "08:00", end: "08:30" }, ...]
- [x] **Criterio:** Token validado e dados do médico retornados para o frontend exibir na booking page; slots corretos com horários ocupados removidos

---

## ✅ US-7.3: Como paciente, quero agendar uma consulta

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] POST /api/v1/public/booking/:slug/book { token, name, phone, dateTime }
- [x] Valida token + rate limit + max 2 consultas ativas por phone
- [x] findOrCreate paciente + cria appointment (source: 'agent')
- [x] Marca token como used
- [x] Insere event_log (appointment.created, actor_type: 'agent')
- [x] dateTime validado como ISO 8601 com offset (z.string().datetime({ offset: true }))
- [x] **Criterio:** Consulta criada, token consumido, conflito detectado (CT-73-01 a CT-73-07 passando)

---

## ✅ US-7.4: Como agente interno, quero consultar slots e agendar in-chat

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] `bookingService.getSlotsInternal(tenantId, date)` (chamada interna de servico, sem token de booking)
- [x] `bookingService.bookInChat(tenantId, { name, phone, dateTime })` (chamada interna)
- [x] Mesmo calculo de slots e validacoes (max 2 ativas por phone, conflito)
- [x] patient.source = 'whatsapp_agent', appointment.created_by = 'agent', sem acesso a booking_tokens
- [x] **Criterio:** Agente consegue listar slots e criar consultas diretamente pelo codigo (CT-74-01 a CT-74-04 passando)

---

## ✅ US-7.5: [FRONTEND] Pagina publica de agendamento

**Agentes:** `frontend` → `designer` → `qa`

- [x] `apps/web/src/routes/book/$slug.tsx` — página pública com 4 estados (validando, erro, booking flow 3-steps, confirmação)
- [x] `apps/web/src/lib/queries/booking.ts` — `validateTokenQueryOptions`, `availableSlotsQueryOptions`, `useBookAppointment`
- [x] `apps/web/src/main.tsx` — `bookingRoute` registrado sem guard (público)
- [x] Valida token na entrada (`GET /validate`) — exibe mensagem adequada por `reason` (expired/used/not_found)
- [x] Step 1: input de data com `min=hoje`; Step 2: grid de slots 3-col; Step 3: form (nome, telefone) com phone pré-preenchido readonly se token vinculado
- [x] Tela de confirmação: "Consulta agendada! Você receberá confirmação no WhatsApp." com data/hora e médico
- [x] Race condition (409 SLOT_CONFLICT) → retorna ao step 2 com mensagem
- [x] Design system: paleta âmbar/creme/azul aço, Montserrat headings, mobile-first max-w-lg
- [x] `app.css`: corrigido `--color-amber-mid` de `#9a7a2e` para `#af830d`
- [x] **Criterio:** Booking completo no browser (CT-75-01 a CT-75-05 — Playwright 5/5 ✅)
