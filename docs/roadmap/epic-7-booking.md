# EPIC 7: Agendamento Publico (Booking)

| Field | Value |
|-------|-------|
| **Epic** | 7 |
| **Name** | Agendamento Publico (Booking) |
| **Description** | Pagina de agendamento para pacientes + booking in-chat via agente interno |
| **Dependencies** | EPIC 5 (Gestao de Consultas) |
| **User Stories** | 5 |

---

## US-7.1: Como agente interno, quero gerar um token de booking para enviar ao paciente

- [ ] `bookingService.generateToken(tenantId, phone?)` (chamada interna de servico)
- [ ] Gera token (24h), salva em booking_tokens
- [ ] Retorna { token, expiresAt, bookingUrl }
- [ ] **Criterio:** Token gerado, valido por 24h, chamavel pelo agent.service

---

## US-7.2: Como paciente, quero ver horarios disponiveis do doutor

- [ ] `booking.controller.ts` → `GET /api/v1/public/booking/:slug/validate?token=X` — valida token + retorna dados do médico (`{ valid, doctor: { name, specialty }, tenant: { name, primaryColor, logoUrl } }`)
- [ ] GET /api/v1/public/booking/:slug/slots?date=2024-01-15&token=X
- [ ] Valida token, calcula slots (working_hours - appointments existentes)
- [ ] Retorna [{ start: "08:00", end: "08:30" }, ...]
- [ ] **Criterio:** Token validado e dados do médico retornados para o frontend exibir na booking page; slots corretos com horários ocupados removidos

---

## US-7.3: Como paciente, quero agendar uma consulta

- [ ] POST /api/v1/public/booking/:slug/book { token, name, phone, dateTime }
- [ ] Valida token + rate limit + max 2 consultas ativas por phone
- [ ] findOrCreate paciente + cria appointment (source: 'agent')
- [ ] Marca token como used
- [ ] Emite evento appointment.created
- [ ] **Criterio:** Consulta criada, token consumido, conflito detectado

---

## US-7.4: Como agente interno, quero consultar slots e agendar in-chat

- [ ] `bookingService.getSlots(tenantId, date)` (chamada interna de servico, sem token de booking)
- [ ] `bookingService.bookInChat(tenantId, { name, phone, dateTime })` (chamada interna)
- [ ] Mesmo calculo de slots e validacoes (max 2 ativas por phone, conflito)
- [ ] **Criterio:** Agente consegue listar slots e criar consultas diretamente pelo codigo

---

## US-7.5: [FRONTEND] Pagina publica de agendamento

- [ ] routes/book/$slug.tsx
- [ ] Valida token na entrada
- [ ] Calendario (selecionar data) → lista de slots → form (nome, telefone) → confirmar
- [ ] Tela de confirmacao: "Consulta agendada! Voce recebera confirmacao no WhatsApp"
- [ ] **Criterio:** Booking completo no browser
