# config/ — Validação de Ambiente

## O que este módulo faz

Valida todas as variáveis de ambiente na inicialização do app usando Zod. Se qualquer variável obrigatória estiver ausente ou inválida, o processo termina com `exit(1)` antes do NestJS subir.

## Arquivo principal

| Arquivo | Responsabilidade |
|---|---|
| `env.ts` | Schema Zod + parse + export do objeto `env` validado |

## Como usar

```typescript
import { env } from '../config/env'

// Acesso direto — sem process.env nos módulos
env.DB_HOST
env.JWT_SECRET
env.EVOLUTION_WEBHOOK_TOKEN
```

## Variáveis validadas

| Variável | Tipo | Obrigatória |
|---|---|---|
| `NODE_ENV` | `development \| production \| test` | Default: `development` |
| `PORT` | number | Default: `3000` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | string/number | Sim |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | string (min 16 chars) | Sim |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | string | Default: `15m` / `7d` |
| `RESEND_API_KEY` | string (prefixo `re_`) | Sim |
| `EMAIL_FROM` | email | Default: `noreply@nocrato.com.br` |
| `EVOLUTION_API_URL` | URL válida | Sim |
| `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN` | string | Sim |
| `WEBHOOK_BASE_URL` | URL | Default: `http://localhost:3000` |
| `OPENAI_API_KEY` | string (prefixo `sk-`) | Sim |
| `DOCUMENT_ENCRYPTION_KEY` | hex 64 chars | Sim |
| `SENTRY_DSN` | URL | Não (opcional) |
| `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN` | string | Não (Cloud API, opcional) |
| `META_WEBHOOK_VERIFY_TOKEN`, `META_EMBEDDED_SIGNUP_CONFIG_ID` | string | Não (Cloud API, opcional) |
| `META_GRAPH_API_VERSION` | string | Default: `v19.0` |

## Regras

- **Nunca usar `process.env` diretamente nos módulos** — sempre importar `env` daqui
- **Nunca adicionar uma env var sem adicioná-la também ao `.env.example`**
- Falha rápida (`process.exit(1)`) é intencional — app não deve subir com env inválida

## O que NÃO pertence aqui

- Configuração do NestJS (app.module, main.ts)
- Configuração do Knex (pertence a `database/knexfile.ts`)
- Secrets em hardcode
