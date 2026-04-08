import * as dotenv from 'dotenv'
import * as path from 'path'
import { z } from 'zod'

// Carrega .env da raiz do monorepo (apps/api roda 2 níveis abaixo da raiz)
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

  // Evolution API (WhatsApp)
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_WEBHOOK_TOKEN: z.string().min(1),

  // Frontend
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // OpenAI (módulo agent/ — gpt-4o-mini)
  OPENAI_API_KEY: z.string().startsWith('sk-'),

  // E2E — bypass de ThrottlerGuard em NODE_ENV=test (ver TD-29 + E2eAwareThrottlerGuard)
  E2E_THROTTLE_BYPASS_SECRET: z.string().min(16).optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = z.infer<typeof envSchema>
