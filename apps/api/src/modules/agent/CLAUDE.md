# Módulo: agent/

## O que este módulo faz

Agente WhatsApp interno do Nocrato Health. Recebe mensagens da Evolution API via webhook,
processa com OpenAI SDK (gpt-4o-mini) e envia respostas de volta via WhatsApp.
Também reage a eventos internos do sistema (EventEmitter2) para notificar pacientes.

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `agent.module.ts` | Declara controller, AgentService e WhatsAppService; exporta ambos os services |
| `agent.controller.ts` | `POST /api/v1/agent/webhook` — recebe payload da Evolution API, valida token, chama AgentService |
| `agent.service.ts` | handleMessage(): orquestra LLM + tools; @OnEvent handlers para notificações |
| `whatsapp.service.ts` | HTTP client para Evolution API — sendText() via fetch nativo (Node 18+) |
| `conversation.service.ts` | CRUD da tabela conversations — histórico JSONB por phone (US-9.3) |
| `agent.controller.spec.ts` | Testes unitários do webhook: validação apikey, fromMe, eventos ignorados |
| `whatsapp.service.spec.ts` | Testes unitários do sendText: headers, body, erros HTTP |

## Regras de negócio

- **Sem JWT guard no webhook**: rota pública, autenticada via header `apikey` comparado com `EVOLUTION_WEBHOOK_TOKEN`
- **Anti-loop obrigatório**: mensagens com `fromMe=true` são ignoradas silenciosamente (HTTP 200, sem processamento)
- **Apenas `messages.upsert`**: outros eventos da Evolution API (`connection.update`, etc.) retornam 200 sem processamento
- **Fire-and-forget seguro**: handlers @OnEvent nunca propagam exceções — erros são logados com NestJS Logger
- **OpenAI exclusivamente**: nunca usar Anthropic SDK neste módulo — modelo obrigatório: `gpt-4o-mini`
- **Tenant resolution via instância**: o tenant é resolvido pela instância Evolution configurada por doutor (US-9.3)
- **Histórico truncado**: máximo 20 mensagens no JSONB `conversations.messages` (US-9.3)

## Interface do payload da Evolution API

```typescript
interface EvolutionWebhookPayload {
  event: string
  data: {
    key: {
      remoteJid: string
      fromMe: boolean
    }
    message?: {
      conversation?: string
    }
    pushName?: string
  }
}
```

## Variáveis de ambiente utilizadas

| Variável | Uso |
|----------|-----|
| `EVOLUTION_API_URL` | Base URL da Evolution API |
| `EVOLUTION_API_KEY` | Chave para autenticar requisições à Evolution API |
| `EVOLUTION_INSTANCE` | Nome da instância WhatsApp |
| `EVOLUTION_WEBHOOK_TOKEN` | Token validado no header `apikey` do webhook recebido |
| `OPENAI_API_KEY` | Chave para o SDK OpenAI (US-9.3) |

## Dependências de outros módulos

- `DatabaseModule` — `@Global()`, não reimportar
- `EventLogModule` — `@Global()`, não reimportar
- `BookingModule` — importado pelo AgentModule para US-9.3 (bookInChat, generateToken, getSlots)

## O que NÃO pertence a este módulo

- Auth JWT de doctor/agency (guards JWT nunca usados aqui)
- CRUD de pacientes (leitura via PatientService importado em US-9.3)
- Geração de tokens de booking (pertence a booking/ — apenas consumido aqui)
- Frontend (pertence a apps/web/)

## Como testar isoladamente

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=agent
```
