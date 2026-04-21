# Módulo: agent/

## O que este módulo faz

Agente WhatsApp interno do Nocrato Health. Recebe mensagens via webhook (Meta Cloud API),
processa com OpenAI SDK (gpt-4o-mini) e envia respostas de volta via WhatsApp.
Também reage a eventos internos do sistema (EventEmitter2) para notificar pacientes.

Usa exclusivamente **Meta Cloud API** (Embedded Signup OAuth, oficial).

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `agent.module.ts` | Controllers + providers (Cloud API); exporta AgentService e WhatsAppService |
| `agent.controller.ts` | `GET/POST /agent/webhook/cloud` (Meta Cloud API) |
| `agent.service.ts` | processMessage(): core LLM + tools; handleMessageFromCloud; handleDoctorMessage; sendWhatsAppMessage |
| `whatsapp.service.ts` | sendViaCloud() Meta Cloud API |
| `whatsapp-connection.provider.ts` | Interface SignupBasedConnectionProvider + Symbol CLOUD_API_CONNECTION_PROVIDER |
| `cloud-api-connection.provider.ts` | Implementação Cloud API (exchangeSignupCode OAuth flow) |
| `whatsapp-connection.controller.ts` | `POST /doctor/whatsapp/connect-cloud` (OAuth) + `PATCH conversations/:phone/mode` |
| `conversation.service.ts` | CRUD da tabela conversations — histórico JSONB por phone |
| `agent.controller.spec.ts` | Testes unitários do webhook Cloud API (8 CTs) |
| `agent.service.spec.ts` | Testes unitários do AgentService (21 CTs) |
| `whatsapp.service.spec.ts` | Testes unitários do sendViaCloud (6 CTs) |

## Regras de negócio

- **Sem JWT guard nos webhooks**: rotas públicas, autenticadas via HMAC-SHA256 (Cloud API)
- **Handoff humano**: `statuses[].status='sent'` no webhook indica que o doutor respondeu → `handleDoctorMessage` → `activateHumanMode`
- **Fire-and-forget com retry**: handlers @OnEvent usam `@RetryOnError()` (3 retries, backoff exponencial)
- **OpenAI exclusivamente**: nunca usar Anthropic SDK neste módulo — modelo obrigatório: `gpt-4o-mini`
- **Tenant resolution**: via `whatsapp_phone_number_id` em `agent_settings`
- **Histórico truncado**: máximo 20 mensagens no JSONB `conversations.messages`

## Variáveis de ambiente utilizadas

| Variável | Uso |
|----------|-----|
| `OPENAI_API_KEY` | Chave para o SDK OpenAI |
| `META_APP_ID` | App ID da Meta (Cloud API, opcional) |
| `META_APP_SECRET` | Secret do app — valida HMAC do webhook Cloud (opcional) |
| `META_SYSTEM_USER_TOKEN` | Token permanente da Nocrato — envia mensagens Cloud (opcional) |
| `META_WEBHOOK_VERIFY_TOKEN` | Token de verificação do handshake Cloud (opcional) |
| `META_GRAPH_API_VERSION` | Versão do Graph API, default v19.0 |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | Config ID do Embedded Signup (frontend, opcional) |

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
