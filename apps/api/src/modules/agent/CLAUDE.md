# Módulo: agent/

## O que este módulo faz

Agente WhatsApp interno do Nocrato Health. Recebe mensagens via webhook (Evolution API ou Meta Cloud API),
processa com OpenAI SDK (gpt-4o-mini) e envia respostas de volta via WhatsApp.
Também reage a eventos internos do sistema (EventEmitter2) para notificar pacientes.

Suporta **dois providers** (coexistem):
- **Evolution API** — conexão via QR code, risco de ban (não-oficial)
- **Meta Cloud API** — Embedded Signup OAuth, oficial, recomendado pra produção

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `agent.module.ts` | Controllers + providers (Evolution + Cloud); exporta AgentService e WhatsAppService |
| `agent.controller.ts` | `POST /agent/webhook` (Evolution) + `GET/POST /agent/webhook/cloud` (Meta Cloud API) |
| `agent.service.ts` | processMessage(): core LLM + tools; handleMessage (Evolution) + handleMessageFromCloud (Cloud); sendWhatsAppMessage routing |
| `whatsapp.service.ts` | sendText() Evolution API + sendViaCloud() Meta Cloud API |
| `whatsapp-connection.provider.ts` | Interface WhatsAppConnectionProvider + SignupBasedConnectionProvider + Symbols |
| `evolution-connection.provider.ts` | Implementação Evolution (create/QR/status/disconnect/delete) |
| `cloud-api-connection.provider.ts` | Implementação Cloud API (exchangeSignupCode OAuth flow) |
| `whatsapp-connection.controller.ts` | `POST /doctor/whatsapp/connect` (QR) + `connect-cloud` (OAuth) + `GET status/qr` + `DELETE disconnect` |
| `conversation.service.ts` | CRUD da tabela conversations — histórico JSONB por phone |
| `agent.controller.spec.ts` | Testes unitários do webhook |
| `whatsapp.service.spec.ts` | Testes unitários do sendText |

## Regras de negócio

- **Dual provider**: Evolution e Cloud coexistem. Cloud tem precedência se `whatsapp_phone_number_id` preenchido
- **Sem JWT guard nos webhooks**: rotas públicas, autenticadas via header `apikey` (Evolution) ou HMAC-SHA256 (Cloud)
- **Anti-loop obrigatório**: mensagens com `fromMe=true` ignoradas (Evolution); Cloud API não envia fromMe
- **Fire-and-forget com retry**: handlers @OnEvent usam `@RetryOnError()` (3 retries, backoff exponencial)
- **OpenAI exclusivamente**: nunca usar Anthropic SDK neste módulo — modelo obrigatório: `gpt-4o-mini`
- **Tenant resolution**: Evolution via `evolution_instance_name`; Cloud via `whatsapp_phone_number_id`
- **Histórico truncado**: máximo 20 mensagens no JSONB `conversations.messages`

## Interface do payload da Evolution API

```typescript
interface EvolutionWebhookPayload {
  event: string
  instance: string  // Nome da instância Evolution — usado para resolver o tenant (TD-20)
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
| `EVOLUTION_WEBHOOK_TOKEN` | Token validado no header `apikey` do webhook Evolution |
| `WEBHOOK_BASE_URL` | URL pública do backend para callback de webhook |
| `OPENAI_API_KEY` | Chave para o SDK OpenAI |
| `META_APP_ID` | App ID da Meta (Cloud API, opcional) |
| `META_APP_SECRET` | Secret do app — valida HMAC do webhook Cloud (opcional) |
| `META_SYSTEM_USER_TOKEN` | Token permanente da Nocrato — envia mensagens Cloud (opcional) |
| `META_WEBHOOK_VERIFY_TOKEN` | Token de verificação do handshake Cloud (opcional) |
| `META_GRAPH_API_VERSION` | Versão do Graph API, default v19.0 |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | Config ID do Embedded Signup (frontend, opcional) |

> **Nota:** `EVOLUTION_INSTANCE` foi removida (TD-20). Variáveis META_* são opcionais enquanto Evolution for o provider ativo.

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
