import * as dotenv from 'dotenv'
import * as path from 'path'
import { z } from 'zod'

// Carrega .env da raiz do monorepo (apps/api roda 2 níveis abaixo da raiz).
// Em NODE_ENV=test, .env.test é carregado ANTES — dotenv não sobrescreve vars
// já definidas em process.env, então .env.test vence sobre .env (DB_NAME etc).
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '../../.env.test') })
}
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') })
// Fallback: .env local em apps/api/ (caso exista)
dotenv.config()

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(64),
  JWT_REFRESH_SECRET: z.string().min(64),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Resend (Email)
  RESEND_API_KEY: z.string().startsWith('re_'),
  EMAIL_FROM: z.string().email().default('noreply@nocrato.com.br'),

  // Meta WhatsApp Cloud API
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().min(16).optional(),
  META_SYSTEM_USER_TOKEN: z.string().min(16).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(16).optional(),
  META_GRAPH_API_VERSION: z.string().default('v19.0'),
  META_EMBEDDED_SIGNUP_CONFIG_ID: z.string().optional(),

  // Frontend
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // OpenAI (módulo agent/ — gpt-4o-mini)
  OPENAI_API_KEY: z.string().startsWith('sk-'),

  // E2E — bypass de ThrottlerGuard em NODE_ENV=test (ver TD-29 + E2eAwareThrottlerGuard)
  E2E_THROTTLE_BYPASS_SECRET: z.string().min(16).optional(),

  // Bugsink (Sentry-compatible) — error tracking self-hosted.
  // Em dev: opcional — se vazio, Sentry.init é pulado e nenhum erro é capturado.
  // Em prod: obrigatório — refine abaixo bloqueia o boot se NODE_ENV=production e DSN ausente.
  SENTRY_DSN: z.string().url().optional(),

  // LGPD — chave simétrica AES-256 para pgp_sym_encrypt/decrypt (64 hex chars = 32 bytes)
  // Usada para patients.document, clinical_notes.content e outros dados sensíveis em repouso.
  // Obrigatória em TODOS os ambientes (inclusive dev/test).
  DOCUMENT_ENCRYPTION_KEY: z.string().length(64, 'DOCUMENT_ENCRYPTION_KEY deve ter 64 hex chars (32 bytes). Gerar com: openssl rand -hex 32'),
}).refine(
  (data) => data.NODE_ENV !== 'test' || !!data.E2E_THROTTLE_BYPASS_SECRET,
  {
    message:
      'E2E_THROTTLE_BYPASS_SECRET é obrigatório quando NODE_ENV=test — ' +
      'defina em .env.test (veja .env.test.example).',
    path: ['E2E_THROTTLE_BYPASS_SECRET'],
  },
).refine(
  (data) => data.NODE_ENV !== 'production' || !!data.SENTRY_DSN,
  {
    message:
      'SENTRY_DSN é obrigatório quando NODE_ENV=production — ' +
      'configure o Bugsink e preencha em .env (veja .env.example).',
    path: ['SENTRY_DSN'],
  },
)

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = z.infer<typeof envSchema>
