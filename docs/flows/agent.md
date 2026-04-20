---
tags: [flow]
type: flow
---

# Agente WhatsApp (Modulo Interno NestJS)

O agente WhatsApp e implementado diretamente no backend NestJS como o modulo `agent/`. Ele se comunica com a **Meta Cloud API** (WhatsApp Business Platform oficial) via webhook (recebe) e Graph API HTTP client (envia). Nao ha ferramenta externa de orquestracao (sem N8N).

> **ADR-018 (2026-04-20)**: a Evolution API foi completamente removida do projeto. O único provider ativo é a Meta Cloud API. Referências históricas a Evolution nos roadmaps/test-cases são preservadas como registro de entrega, mas não refletem o estado atual.

---

## Table of Contents

1. [Visao Geral da Arquitetura](#1-visao-geral-da-arquitetura)
2. [Modulo Agent (Estrutura)](#2-modulo-agent-estrutura)
3. [Webhook da Meta Cloud API](#3-webhook-da-meta-cloud-api)
4. [Fluxo de uma Mensagem](#4-fluxo-de-uma-mensagem)
5. [Estado de Conversa](#5-estado-de-conversa)
6. [Eventos Internos (EventEmitter2)](#6-eventos-internos-eventemitter2)
7. [Integracao com LLM](#7-integracao-com-llm)
8. [Operacoes do Agente](#8-operacoes-do-agente)

---

## 1. Visao Geral da Arquitetura

O módulo usa **exclusivamente a Meta Cloud API** (WhatsApp Business Platform):

```
Paciente (WhatsApp)
      |
      | mensagem
      v
┌─────────────────────────────────────┐
│         Meta Cloud API              │
│         POST /agent/webhook/cloud   │
└────────────────┬────────────────────┘
                 v
         agent.controller.ts
         (valida HMAC-SHA256 X-Hub-Signature-256)
                 v
         agent.service.ts
         processMessage(tenantId, phone, text)
                 │
         ┌───────┴───────┐
         v               v
  conversation.service   OpenAI SDK
  (PostgreSQL)           gpt-4o-mini + tools
                               │
                               v
                     whatsapp.service.ts
                     (Meta Graph API)
                               │
                               v
                      Paciente (WhatsApp)
```

**Tenant resolution**: `agent_settings.whatsapp_phone_number_id` → `tenant_id`.

O webhook da Meta entrega `entry[].changes[].value.metadata.phone_number_id`, que é usado para localizar o tenant correspondente em `agent_settings`. Doutores sem `whatsapp_phone_number_id` configurado não recebem mensagens (o controller ignora silenciosamente).

**Principios:**
- Tudo TypeScript, no mesmo processo NestJS
- Zero latencia de polling (webhook direto)
- Estado da conversa persistido no PostgreSQL
- Eventos internos via `EventEmitter2` (sem polling)
- Apenas provider oficial Meta — sem Evolution API (ADR-018)

---

## 2. Modulo Agent (Estrutura)

```
apps/api/src/modules/agent/
├── agent.module.ts
├── agent.controller.ts        # POST /api/v1/agent/webhook/cloud (Meta Cloud API)
│                              # GET /api/v1/agent/webhook/cloud (verify token handshake)
├── agent.service.ts           # Orquestracao: intent → acao → resposta
│                              # @OnEvent() handlers para eventos internos
├── conversation.service.ts    # CRUD da tabela conversations (mode='agent'|'human')
├── whatsapp.service.ts        # HTTP client para Meta Graph API (send message)
├── whatsapp-connection.controller.ts  # Embedded Signup OAuth (Cloud API)
└── dto/
    └── whatsapp-webhook.dto.ts
```

### Dependencias do Modulo

```typescript
@Module({
  imports: [
    PatientModule,
    AppointmentModule,
    BookingModule,      // para generateToken() e listSlots()
    ClinicalNoteModule,
    EventLogModule,
    EventEmitterModule, // @nestjs/event-emitter
  ],
  controllers: [AgentController],
  providers: [AgentService, ConversationService, WhatsappService],
})
export class AgentModule {}
```

---

## 3. Webhook da Meta Cloud API

A Meta Cloud API envia um POST para o NestJS sempre que uma mensagem chega no WhatsApp — ou quando o status de uma mensagem enviada pela business account muda (`sent`, `delivered`, `read`).

### Endpoints

```
GET  /api/v1/agent/webhook/cloud   # handshake de verificação (Meta challenge)
POST /api/v1/agent/webhook/cloud   # recebe eventos (mensagens + statuses)
Content-Type: application/json

Header enviado pela Meta:
  X-Hub-Signature-256: sha256=<hex>   # HMAC-SHA256 do body cru com META_APP_SECRET
```

O `GET` responde ao `hub.verify_token` (comparado com `META_WEBHOOK_VERIFY_TOKEN`) retornando o `hub.challenge` em plain text.

### Payload de mensagem de texto

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "5511999999999",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{ "profile": { "name": "Joao Santos" }, "wa_id": "5511988887777" }],
        "messages": [{
          "from": "5511988887777",
          "id": "wamid...",
          "timestamp": "1705312200",
          "type": "text",
          "text": { "body": "Quero agendar uma consulta" }
        }]
      }
    }]
  }]
}
```

### Payload de status (doutor enviou mensagem manualmente pelo WhatsApp Business)

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "field": "messages",
      "value": {
        "metadata": { "phone_number_id": "PHONE_NUMBER_ID" },
        "statuses": [{
          "id": "wamid...",
          "recipient_id": "5511988887777",
          "status": "sent",
          "timestamp": "1705312201"
        }]
      }
    }]
  }]
}
```

Este payload dispara `agentService.handleDoctorMessage()` → `conversationService.activateHumanMode()` (ver seed 005: handoff doutor↔agente).

### Validacao no Controller

```typescript
@Post('webhook/cloud')
async handleCloudWebhook(
  @Headers('x-hub-signature-256') signature: string,
  @RawBody() rawBody: Buffer,
  @Body() body: CloudWebhookDto,
) {
  if (!verifyHmac(rawBody, signature, env.META_APP_SECRET)) {
    throw new UnauthorizedException('Assinatura inválida');
  }
  const change = body.entry?.[0]?.changes?.[0]?.value;
  if (!change) return;
  const phoneNumberId = change.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  // Mensagens de texto → processamento pelo LLM
  const message = change.messages?.[0];
  if (message?.type === 'text') {
    await this.agentService.handleMessage({ phoneNumberId, message, contacts: change.contacts });
    return;
  }

  // Mensagens enviadas pelo doutor via WhatsApp Business → handoff para modo humano
  const sentStatus = change.statuses?.find((s) => s.status === 'sent');
  if (sentStatus) {
    await this.agentService.handleDoctorMessage({ phoneNumberId, recipientId: sentStatus.recipient_id });
  }
}
```

---

## 4. Fluxo de uma Mensagem

```
1. Meta Cloud API envia POST /api/v1/agent/webhook/cloud

2. agent.controller.ts:
   - Valida HMAC-SHA256 (X-Hub-Signature-256 vs META_APP_SECRET)
   - Extrai entry[0].changes[0].value
   - Se messages[0].type === 'text' → agentService.handleMessage()
   - Se statuses[].status === 'sent' → agentService.handleDoctorMessage() (handoff humano)

3. agent.service.ts → handleMessage():
   a. Extrai: phone = messages[0].from
              text  = messages[0].text.body
              pushName = contacts[0].profile.name (quando enviado)
              phoneNumberId = metadata.phone_number_id

   b. Resolve tenant pelo phone_number_id:
      agent_settings WHERE enabled=true AND whatsapp_phone_number_id=phoneNumberId
      → early return silencioso (log) se não encontrar

   c. Verifica modo da conversa:
      conversationService.shouldAgentRespond(tenantId, phone)
      → se mode='human' e last_fromme_at < 30min → early return (doutor está conduzindo)

   d. Busca contexto do paciente:
      patientService.findByPhone(tenantId, phone)
      → retorna patient + appointments + notes (se existir)

   e. Busca/cria estado da conversa:
      conversationService.getOrCreate(tenantId, phone)

   f. Chama LLM com contexto:
      - system prompt: personalidade do agente + dados do doutor
      - historico: ultimas N mensagens da conversa
      - mensagem atual: text
      - contexto: patient data (se existir)

   g. LLM retorna: texto de resposta + tool_calls (se necessario)

   h. Executa tool_calls (se houver):
      - list_slots: bookingService.getSlots(tenantId, date)
      - book_appointment: bookingService.bookInChat(...)
      - generate_booking_link: bookingService.generateToken(...)
      - cancel_appointment: appointmentService.cancel(...)

   i. Atualiza historico da conversa:
      conversationService.appendMessages(conversationId, [userMsg, assistantMsg])

   j. Envia resposta via Graph API:
      whatsappService.sendText(phoneNumberId, phone, responseText)
```

---

## 5. Estado de Conversa

### Tabela `conversations` (nova migration)

```sql
CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone       VARCHAR(20)  NOT NULL,
    messages    JSONB        NOT NULL DEFAULT '[]',
    -- historico: [{ role: 'user'|'assistant', content: '...', timestamp: '...' }]
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT conversations_tenant_phone UNIQUE (tenant_id, phone)
);
CREATE INDEX idx_conversations_tenant_phone ON conversations (tenant_id, phone);
```

### Politica de Historico

- Manter ultimas **20 mensagens** no JSONB para o contexto do LLM
- Mensagens mais antigas sao descartadas do contexto (mas o paciente e seus dados persistem no banco)
- Sem necessidade de session token ou JWT — o telefone e o identificador

---

## 6. Eventos Internos (EventEmitter2)

O agente usa `@OnEvent()` do `@nestjs/event-emitter` para reagir a acoes do doutor no portal sem polling.

### Eventos Emitidos pelos Modulos

| Evento | Emitido em | Payload |
|--------|-----------|---------|
| `appointment.status_changed` | `appointment.service.ts` | `{ tenantId, patientId, phone, oldStatus, newStatus, reason? }` |
| `appointment.cancelled` | `appointment.service.ts` | `{ tenantId, phone, dateTime, doctorName, reason? }` |
| `appointment.created` | `booking.service.ts` | `{ tenantId, patientId, phone, dateTime, patientName }` |
| `patient.portal_activated` | `patient.service.ts` | `{ tenantId, phone, portalAccessCode }` |

> **Nota sobre eventos de cancelamento:** O `appointment.service.ts` emite DOIS eventos quando uma consulta é cancelada:
> 1. `appointment.status_changed` (sempre, em toda transição de status) — para o event_log e audit trail
> 2. `appointment.cancelled` (específico) — para o handler do agente WhatsApp com payload rico (inclui `doctorName`)
>
> Isso permite que o agente tenha um handler específico sem depender do evento genérico.

### Handlers no AgentService

```typescript
@OnEvent('appointment.cancelled')
async onAppointmentCancelled(payload: AppointmentCancelledEvent) {
  await this.whatsappService.sendText(
    payload.phone,
    `Sua consulta do dia ${formatDate(payload.dateTime)} foi cancelada pelo Dr. ${payload.doctorName}. ${payload.reason ? `Motivo: ${payload.reason}` : ''}`
  );
}

@OnEvent('patient.portal_activated')
async onPortalActivated(payload: PortalActivatedEvent) {
  await this.whatsappService.sendText(
    payload.phone,
    `Seu portal de saude foi ativado! Acesse em https://app.nocrato.com/patient/access\n\nSeu codigo de acesso: *${payload.portalAccessCode}*`
  );
}

@OnEvent('appointment.status_changed')
async onStatusChanged(payload: StatusChangedEvent) {
  // Notifica apenas transicoes relevantes para o paciente
  if (payload.newStatus === 'waiting') {
    await this.whatsappService.sendText(
      payload.phone,
      'O consultorio esta pronto para te receber! Por favor, dirija-se a recepcao.'
    );
  }
}

@OnEvent('appointment.created')
async onAppointmentCreated(payload: AppointmentCreatedEvent) {
  await this.whatsappService.sendText(
    payload.phone,
    `Consulta confirmada! ✓\n\nOla ${payload.patientName}, sua consulta esta agendada para ${formatDate(payload.dateTime)}.\n\nVoce recebera um lembrete antes da consulta.`
  );
}
```

### Por que EventEmitter2 em vez de Polling

| Aspecto | Polling (N8N) | EventEmitter2 (interno) |
|---------|--------------|------------------------|
| Latencia | 30 segundos | 0ms (sincrono) |
| Complexidade | Cursor management, state externo | Decorador `@OnEvent()` |
| Confiabilidade | Eventos persistidos (nao se perdem) | Melhor esforco (pode perder em crash) |
| Recursos | Servico externo + RAM extra | Zero overhead adicional |

**Para o MVP:** EventEmitter2 e suficiente. Para V2, se necessidade de garantia de entrega, usar BullMQ (queue) com PostgreSQL.

---

## 7. Integracao com LLM

### System Prompt Base

```typescript
function buildSystemPrompt(doctor: Doctor, agentSettings: AgentSettings, patient?: Patient): string {
  return `
Voce e um assistente de saude do consultorio do ${doctor.name} (${doctor.specialty}).

${agentSettings.personality}

Regras de agendamento:
${agentSettings.appointmentRules}

Perguntas frequentes:
${agentSettings.faq}

${patient ? `
Contexto do paciente atual:
- Nome: ${patient.name}
- Ultima consulta: ${patient.lastVisit ?? 'Nenhuma'}      // campo computado via JOIN em patientService.findByPhone()
- Proxima consulta: ${patient.nextAppointment ?? 'Nenhuma agendada'}  // campo computado via JOIN
- Observacoes: ${patient.notes ?? 'Nenhuma'}
` : 'Este e um novo paciente (sem registro ainda).'}

Hoje e ${formatDate(new Date())}.
  `.trim();
}
```

### Tools Disponíveis para o LLM

```typescript
// import OpenAI from 'openai';
// client.chat.completions.create({ model: 'gpt-4o-mini', tools, messages, ... })

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_slots',
      description: 'Lista horarios disponiveis para uma data especifica',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Data no formato YYYY-MM-DD' }
        },
        required: ['date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Agenda uma consulta para o paciente no horario escolhido',
      parameters: {
        type: 'object',
        properties: {
          dateTime: { type: 'string', description: 'ISO 8601 datetime' },
          patientName: { type: 'string' }
        },
        required: ['dateTime', 'patientName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_booking_link',
      description: 'Gera um link de agendamento externo (alternativa ao in-chat)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela uma consulta existente',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['appointmentId']
      }
    }
  }
];
// ChatCompletionTool e do 'openai' npm package (OpenAI SDK v4+)
```

---

## 8. Operacoes do Agente

### 8.1 Agendamento In-Chat

```
Paciente: "Quero agendar para quinta"
  ↓
LLM → tool_call: list_slots({ date: "2024-01-18" })
  ↓
bookingService.getSlots(tenantId, "2024-01-18")
  → [{ start: "08:00" }, { start: "09:00" }, ...]
  ↓
LLM gera resposta com slots formatados
  ↓
Paciente: "09:00 por favor"
  ↓
LLM → tool_call: book_appointment({ dateTime: "2024-01-18T09:00:00", patientName: "Joao" })
  ↓
bookingService.bookInChat(tenantId, phone, name, dateTime)
  → cria appointment + findOrCreate patient + insere event_log
  ↓
LLM gera confirmacao → whatsappService.sendText(...)
```

### 8.2 Link de Agendamento Externo

```
LLM → tool_call: generate_booking_link()
  ↓
bookingService.generateToken(tenantId, phone)
  → INSERT booking_tokens → retorna { token, bookingUrl }
  ↓
whatsappService.sendText(phone, "Aqui esta o link: {bookingUrl}")
```

### 8.3 Envio do Codigo do Portal (via EventEmitter2)

```
Doctor UI: appointment → completed (primeiro)
  ↓
appointment.service.ts:
  patientService.activatePortal(patientId)
  eventEmitter.emit('patient.portal_activated', { phone, code, tenantId })
  event_log.append('patient.portal_activated', ...)
  ↓
agent.service.ts @OnEvent('patient.portal_activated'):
  whatsappService.sendText(phone, "Seu codigo: {code}")
```

### 8.4 Notificacao de Cancelamento (via EventEmitter2)

```
Doctor UI: PATCH /api/v1/doctor/appointments/{id}/status { status: "cancelled" }
  ↓
appointment.service.ts:
  eventEmitter.emit('appointment.cancelled', { phone, dateTime, reason })
  event_log.append('appointment.status_changed', ...)
  ↓
agent.service.ts @OnEvent('appointment.cancelled'):
  whatsappService.sendText(phone, "Sua consulta foi cancelada...")
```

---

## Configuracao de Ambiente

```env
# Meta Cloud API (WhatsApp Business Platform)
META_CLOUD_API_TOKEN=EAAG...            # token de acesso da App do Meta
META_APP_SECRET=...                     # usado pro HMAC-SHA256 do webhook
META_WEBHOOK_VERIFY_TOKEN=...           # usado no handshake GET do webhook
META_APP_ID=...                         # usado no Embedded Signup OAuth

# LLM (OpenAI — usado apenas no modulo agent/ para o chatbot WhatsApp)
OPENAI_API_KEY=sk-...
AGENT_MODEL=gpt-4o-mini   # barato, rapido, excelente tool calling para PT-BR
```

> **Nota**: Cada doutor faz Embedded Signup e obtém seu proprio `whatsapp_phone_number_id` (armazenado em `agent_settings`, ver migration 020). O campo `entry[].changes[].value.metadata.phone_number_id` do webhook é usado para resolver o `tenant_id` sem ambiguidade, garantindo isolamento total entre tenants. Doutores sem `whatsapp_phone_number_id` configurado não recebem mensagens do agente (resolução retorna null silenciosamente).