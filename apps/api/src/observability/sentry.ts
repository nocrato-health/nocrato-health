/**
 * sentry.ts — instrumentação do error tracker (Bugsink via SDK Sentry).
 *
 * Bugsink é Sentry-compatible — expõe a mesma API de ingestão que o Sentry SaaS,
 * então usamos `@sentry/node` diretamente. Trocar pra Sentry SaaS ou outro
 * backend compatível (GlitchTip, Bugsink, Sentry) é questão de trocar a DSN.
 *
 * Config aplicada:
 * - `sendDefaultPii: false` → não coleta headers, cookies, IP, user-agent.
 * - `beforeSend(redactPii)` → aplica redação do SEC-11 no evento final (stack
 *   trace, tags, extras, breadcrumbs). Defense-in-depth: mesmo que o `sendDefaultPii`
 *   deixasse passar, o redactPii pega.
 * - `beforeBreadcrumb(redactPii)` → aplica em breadcrumbs (queries SQL, fetches).
 * - `tracesSampleRate: 0` → performance tracing desligado no MVP (reduz custo
 *   de CPU/rede e evita vazamento de dados de span).
 * - `environment: NODE_ENV` → separa dev/test/prod no Bugsink.
 *
 * NÃO faz init se `SENTRY_DSN` vazia — dev sem Bugsink rodando continua funcionando.
 * NÃO faz init em NODE_ENV=test — não queremos estourar quota de eventos
 * com erros deliberados dos specs.
 */
import * as Sentry from '@sentry/node'
import { env } from '@/config/env'
import { redactPii } from '@/common/logging/redact-pii'

let initialized = false

export function initSentry(): void {
  if (initialized) return
  if (env.NODE_ENV === 'test') return
  if (!env.SENTRY_DSN) {
    // Dev sem Bugsink rodando — não é erro, só skip.
    console.log('ℹ️  Sentry/Bugsink: SENTRY_DSN vazio, error tracking desabilitado.')
    return
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // LGPD: não coletar headers, cookies, IP, user-agent automaticamente.
    sendDefaultPii: false,
    // Performance tracing desligado no MVP — só error tracking.
    tracesSampleRate: 0,
    // Defense-in-depth: redata o evento final mesmo que algo tenha vazado
    // pelos filtros anteriores. `redactPii` deep-redacta por allowlist de
    // chaves + regex em strings (email, phone, CPF, JWT, hex64 tokens).
    beforeSend(event) {
      return redactPii(event)
    },
    beforeBreadcrumb(breadcrumb) {
      return redactPii(breadcrumb)
    },
  })

  initialized = true
  console.log(`✅ Sentry/Bugsink inicializado (environment=${env.NODE_ENV})`)
}

/**
 * Reexporta o namespace Sentry pra call sites que precisem capturar erros
 * manualmente. Ex: `captureException(err)` em filters ou services.
 */
export { Sentry }
