---
tags: [roadmap, v1, epic]
type: epic
status: completed
---

# EPIC 9: Agente WhatsApp (Modulo Interno)

| Field | Value |
|-------|-------|
| **Epic** | 9 |
| **Name** | Agente WhatsApp (Modulo Interno NestJS) |
| **Description** | Implementacao do agente WhatsApp como modulo NestJS usando Evolution API + OpenAI SDK (gpt-4o-mini). Sem N8N. *Nota 2026-04-20: provider Evolution foi substituído pela Meta Cloud API — ver ADR-018.* |
| **Dependencies** | EPIC 7 (Agendamento Publico), EPIC 8 (Configuracoes & Agente) |
| **User Stories** | 4 |

> **Casos de teste:** [[test-cases/epic-9|Test Cases — Epic 9]]

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

- [x] `whatsapp.service.ts` → HTTP client para Evolution API (envio de mensagens) — *nota 2026-04-20: substituído por client Meta Graph API*
- [x] `agent.controller.ts` → `POST /api/v1/agent/webhook` (recebe payload da Evolution API) — *nota 2026-04-20: endpoint removido; ativo apenas `POST /api/v1/agent/webhook/cloud` (Meta Cloud API)*
- [x] Valida token da Evolution API via header `apikey` — *nota 2026-04-20: validação atual usa HMAC-SHA256 via header `X-Hub-Signature-256`*
- [x] Ignora mensagens `fromMe=true`
- [x] Chama `agentService.handleMessage(payload)`
- [x] **Criterio:** Mensagens do WhatsApp chegam ao NestJS e sao processadas

---

## ✅ US-9.3: Como agente, quero processar mensagens com LLM e executar acoes

**Agentes:** `backend` + `dba` → `tech-lead` → `qa`

- [x] `conversation.service.ts` → CRUD da tabela `conversations` (getOrCreate + appendMessages com trim a 20 msgs)
- [x] Migration `013_conversations.ts` → tabela com `messages` JSONB (já existia desde o setup inicial)
- [x] `agent.service.ts` → handleMessage() completo:
  - Resolve tenant via `agent_settings.enabled=true` (MVP instância única; TD registrado)
  - Busca contexto do paciente via `patientService.findByPhone`
  - Busca/cria conversa via `conversationService.getOrCreate`
  - Monta system prompt com personalidade, regras, FAQ e contexto do paciente
  - Chama OpenAI SDK (gpt-4o-mini) com loop de tool_calls (máx 5 iterações)
  - Executa tools: `list_slots`, `book_appointment`, `generate_booking_link`, `cancel_appointment`
  - `cancel_appointment` usa `appointmentService.cancelByAgent` (actor_type='agent', actor_id=null)
  - Atualiza histórico via `conversationService.appendMessages`
  - Envia resposta via `whatsappService.sendText()`
- [x] `patientService.findByPhone(tenantId, phone)` adicionado ao PatientService
- [x] `appointmentService.cancelByAgent(tenantId, appointmentId, reason)` adicionado (fix crítico: actor_id UUID)
- [x] TD-18 resolvido: validação de `remoteJid` no controller antes de chamar `handleMessage`
- [x] 18 testes novos (7 conversation.service + 11 agent.service) — total: 566/566
- [x] **Criterio:** Paciente consegue agendar, cancelar e tirar duvidas via WhatsApp

---

## ✅ US-9.4: Como agente, quero notificar pacientes sobre eventos do portal

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] `@OnEvent('appointment.cancelled')` → envia WhatsApp com informacao do cancelamento
- [x] `@OnEvent('patient.portal_activated')` → envia codigo de acesso ao portal
- [x] `@OnEvent('appointment.status_changed')` onde `newStatus='waiting'` → notifica paciente
- [x] `@OnEvent('appointment.created')` → envia WhatsApp confirmando detalhes da consulta recém-agendada (via booking público ou in-chat)
- [x] Fire-and-forget seguro: todos os handlers com try/catch — exceções logadas, nunca propagadas
- [x] Knex direto com tenant isolation para busca de phone nos eventos que não carregam phone no payload
- [x] 6 testes novos (CT-94-01 a CT-94-06) — total: 572/572
- [x] **Criterio:** Paciente recebe confirmação imediata após agendamento e notificações automáticas sem latência (EventEmitter2, zero polling)

---

## Links Relacionados

- [[flows/agent|Agente WhatsApp]]
- [[flows/booking-flow|Fluxo de Booking]]
- [[architecture/decisions|ADRs]]
