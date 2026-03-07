# EPIC 9: Agente WhatsApp (Modulo Interno)

| Field | Value |
|-------|-------|
| **Epic** | 9 |
| **Name** | Agente WhatsApp (Modulo Interno NestJS) |
| **Description** | Implementacao do agente WhatsApp como modulo NestJS usando Evolution API + OpenAI SDK (gpt-4o-mini). Sem N8N. |
| **Dependencies** | EPIC 7 (Agendamento Publico), EPIC 8 (Configuracoes & Agente) |
| **User Stories** | 4 |

> **Casos de teste:** [docs/test-cases/epic-9.md](../test-cases/epic-9.md)

---

## ✅ US-9.1: Como sistema, quero registrar eventos internos e reagir a eles

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] Configurar `@nestjs/event-emitter` no `app.module.ts`
- [x] `appointment.service.ts` → emite `appointment.status_changed`, `appointment.cancelled`
- [x] `patient.service.ts` → emite `patient.portal_activated`
- [x] `event-log.service.ts` → continua fazendo append no banco para audit trail
- [x] **Criterio:** Eventos emitidos e auditados automaticamente nas acoes relevantes

---

## ✅ US-9.2: Como agente, quero receber mensagens do WhatsApp via webhook

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] `whatsapp.service.ts` → HTTP client para Evolution API (envio de mensagens)
- [x] `agent.controller.ts` → `POST /api/v1/agent/webhook` (recebe payload da Evolution API)
- [x] Valida token da Evolution API via header `apikey`
- [x] Ignora mensagens `fromMe=true`
- [x] Chama `agentService.handleMessage(payload)`
- [x] **Criterio:** Mensagens do WhatsApp chegam ao NestJS e sao processadas

---

## US-9.3: Como agente, quero processar mensagens com LLM e executar acoes

**Agentes:** `backend` + `dba` → `tech-lead` → `qa`

- [ ] `conversation.service.ts` → CRUD da tabela `conversations` (estado por phone)
- [ ] Migration `013_conversations.sql` → tabela com `messages` JSONB
- [ ] `agent.service.ts` → handleMessage():
  - Busca contexto do paciente via `patientService`
  - Busca/cria conversa via `conversationService`
  - Chama OpenAI SDK (gpt-4o-mini) com system prompt + historico + tools
  - Executa tool_calls: `list_slots`, `book_appointment`, `generate_booking_link`, `cancel_appointment`
  - Atualiza historico da conversa
  - Envia resposta via `whatsappService.sendText()`
- [ ] **Criterio:** Paciente consegue agendar, cancelar e tirar duvidas via WhatsApp

---

## US-9.4: Como agente, quero notificar pacientes sobre eventos do portal

**Agentes:** `backend` → `tech-lead` → `qa`

- [ ] `@OnEvent('appointment.cancelled')` → envia WhatsApp com informacao do cancelamento
- [ ] `@OnEvent('patient.portal_activated')` → envia codigo de acesso ao portal
- [ ] `@OnEvent('appointment.status_changed')` onde `newStatus='waiting'` → notifica paciente
- [ ] `@OnEvent('appointment.created')` → envia WhatsApp confirmando detalhes da consulta recém-agendada (via booking público ou in-chat)
- [ ] **Criterio:** Paciente recebe confirmação imediata após agendamento e notificações automáticas sem latência (EventEmitter2, zero polling)
