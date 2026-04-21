---
tags: [flow]
type: flow
---

# Agente WhatsApp (Modulo Interno NestJS)

O agente WhatsApp e implementado diretamente no backend NestJS como o modulo `agent/`. Ele se comunica com a Evolution API via webhook (recebe) e HTTP client (envia). Nao ha ferramenta externa de orquestracao (sem N8N).

---

## Table of Contents

1. [Visao Geral da Arquitetura](#1-visao-geral-da-arquitetura)
2. [Modulo Agent (Estrutura)](#2-modulo-agent-estrutura)
3. [Webhook da Evolution API](#3-webhook-da-evolution-api)
4. [Fluxo de uma Mensagem](#4-fluxo-de-uma-mensagem)
5. [Estado de Conversa](#5-estado-de-conversa)
6. [Eventos Internos (EventEmitter2)](#6-eventos-internos-eventemitter2)
7. [Integracao com LLM](#7-integracao-com-llm)
8. [Operacoes do Agente](#8-operacoes-do-agente)

---

## 1. Visao Geral da Arquitetura

O módulo suporta **dois providers** que coexistem. O roteamento é automático:

```
Paciente (WhatsApp)
      |
      | mensagem
      v
┌─────────────────────────────────────┐
│  Evolution API        Meta Cloud API│
│  POST /agent/webhook  POST /agent/  │
│                       webhook/cloud │
└──────────┬────────────────┬─────────┘
           v                v
      agent.controller.ts
      (valida apikey)   (valida HMAC-SHA256)
           │                │
           └───────┬────────┘
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
                  sendWhatsAppMessage()
                   │               │
                   v               v
             sendViaCloud()   sendText()
             (Meta Graph)    (Evolution)
                   │               │
                   v               v
            Paciente (WhatsApp)
```

**Tenant resolution:**
- Evolution: `agent_settings.evolution_instance_name` → tenant_id
- Cloud API: `agent_settings.whatsapp_phone_number_id` → tenant_id

**Prioridade:** se `whatsapp_phone_number_id` preenchido → usa Cloud API. Senão → Evolution.

**Principios:**
- Tudo TypeScript, no mesmo processo NestJS
- Zero latencia de polling (webhook direto)
- Estado da conversa persistido no PostgreSQL
- Eventos internos via `EventEmitter2` (sem polling)

---

## 2. Modulo Agent (Estrutura)

```
apps/api/src/modules/agent/
├── agent.module.ts
├── agent.controller.ts        # POST /api/v1/agent/webhook (Evolution API)
├── agent.service.ts           # Orquestracao: intent → acao → resposta
│                              # @OnEvent() handlers para eventos internos
├── conversation.service.ts    # CRUD da tabela conversations
├── whatsapp.service.ts        # HTTP client para Evolution API (send message)
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

## 3. Webhook da Evolution API

A Evolution API envia um POST para o NestJS sempre que uma mensagem chega no WhatsApp.

### Endpoint

```
POST /api/v1/agent/webhook
Content-Type: application/json

Headers enviados pela Evolution API:
  apikey: {EVOLUTION_WEBHOOK_TOKEN}   # validado no controller
```

### Payload (exemplo de mensagem de texto)

```json
{
  "event": "messages.upsert",
  "instance": "dr-marcos-instance",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0..."
    },
    "message": {
      "conversation": "Quero agendar uma consulta"
    },
    "messageTimestamp": "1705312200",
    "pushName": "Joao Santos"
  }
}
```

### Validacao no Controller

```typescript
@Post('webhook')
async handleWebhook(@Headers('apikey') apiKey: string, @Body() body: WhatsappWebhookDto) {
  if (apiKey !== env.EVOLUTION_WEBHOOK_TOKEN) throw new UnauthorizedException('Token inválido');
  if (body.event !== 'messages.upsert') return;
  if (!body.instance) return;             // campo obrigatório para resolução do tenant
  if (!body.data?.key?.remoteJid) return; // TD-18
  if (body.data.key.fromMe === true) return; // anti-loop
  await this.agentService.handleMessage(body);
}
```

---

## 4. Fluxo de uma Mensagem

```
1. Evolution API envia POST /api/v1/agent/webhook

2. agent.controller.ts:
   - Valida apikey header
   - Ignora mensagens fromMe=true
   - Chama agentService.handleMessage(payload)

3. agent.service.ts → handleMessage():
   a. Extrai: phone = remoteJid sem @s.whatsapp.net
              text = message.conversation
              pushName = nome do WhatsApp

   b. Resolve tenant pelo nome da instancia Evolution (payload.instance):
      agent_settings WHERE enabled=true AND evolution_instance_name=payload.instance
      → NotFoundException silenciosa (log + early return) se não encontrar

   c. Busca contexto do paciente:
      patientService.findByPhone(tenantId, phone)
      → retorna patient + appointments + notes (se existir)

   d. Busca/cria estado da conversa:
      conversationService.getOrCreate(tenantId, phone)

   e. Chama LLM com contexto:
      - system prompt: personalidade do agente + dados do doutor
      - historico: ultimas N mensagens da conversa
      - mensagem atual: text
      - contexto: patient data (se existir)

   f. LLM retorna: texto de resposta + tool_calls (se necessario)

   g. Executa tool_calls (se houver):
      - list_slots: bookingService.getSlots(tenantId, date)
      - book_appointment: bookingService.bookInChat(...)
      - generate_booking_link: bookingService.generateToken(...)
      - cancel_appointment: appointmentService.cancel(...)

   h. Atualiza historico da conversa:
      conversationService.appendMessages(conversationId, [userMsg, assistantMsg])

   i. Envia resposta:
      whatsappService.sendText(phone, responseText)
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
# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-api-key
EVOLUTION_INSTANCE=nocrato-instance
EVOLUTION_WEBHOOK_TOKEN=your-webhook-validation-token

# LLM (OpenAI — usado apenas no modulo agent/ para o chatbot WhatsApp)
OPENAI_API_KEY=sk-...
AGENT_MODEL=gpt-4o-mini   # barato, rapido, excelente tool calling para PT-BR
```

> **Nota**: Cada doutor configura seu proprio `evolution_instance_name` em `agent_settings`. O campo `payload.instance` do webhook é usado para resolver o `tenant_id` sem ambiguidade, garantindo isolamento total entre tenants. Doutores sem `evolution_instance_name` configurado não recebem mensagens do agente (resolveTenantFromInstance retorna null silenciosamente).