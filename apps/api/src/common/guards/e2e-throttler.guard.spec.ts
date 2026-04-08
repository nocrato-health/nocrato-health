// Mock do env ANTES de importar o guard (mesmo padrão dos outros specs do projeto).
// Cada teste ajusta os campos relevantes via Object.assign no beforeEach.
jest.mock('@/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    E2E_THROTTLE_BYPASS_SECRET: undefined as string | undefined,
    JWT_SECRET: 'test-secret-at-least-16-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-16-chars',
    RESEND_API_KEY: 'test',
    FRONTEND_URL: 'http://localhost:5173',
    OPENAI_API_KEY: 'test',
  },
}))

// Também mockamos o ThrottlerGuard base para poder espiar shouldSkip do super
// sem invocar a lógica real do rate-limit (que depende de storage).
jest.mock('@nestjs/throttler', () => ({
  ThrottlerGuard: class MockThrottlerGuard {
    async shouldSkip(): Promise<boolean> {
      return false
    }
  },
}))

import { ExecutionContext } from '@nestjs/common'
import { env } from '@/config/env'
import { E2eAwareThrottlerGuard } from './e2e-throttler.guard'

const BYPASS_SECRET = 'a'.repeat(32)

function makeContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext
}

describe('E2eAwareThrottlerGuard', () => {
  let guard: E2eAwareThrottlerGuard

  beforeEach(() => {
    guard = new E2eAwareThrottlerGuard(
      {} as never,
      {} as never,
      {} as never,
    )
    // Reset env entre testes
    ;(env as { NODE_ENV: string }).NODE_ENV = 'test'
    ;(env as { E2E_THROTTLE_BYPASS_SECRET: string | undefined }).E2E_THROTTLE_BYPASS_SECRET =
      BYPASS_SECRET
  })

  it('delega ao super quando NODE_ENV !== "test" (caminho de prod)', async () => {
    ;(env as { NODE_ENV: string }).NODE_ENV = 'production'
    const ctx = makeContext({ 'x-e2e-bypass': BYPASS_SECRET })

    // Com secret no header mas em prod, não pode bypassar — resultado do super (false).
    await expect(guard['shouldSkip'](ctx)).resolves.toBe(false)
  })

  it('delega ao super quando E2E_THROTTLE_BYPASS_SECRET não está setado', async () => {
    ;(env as { E2E_THROTTLE_BYPASS_SECRET: string | undefined }).E2E_THROTTLE_BYPASS_SECRET =
      undefined
    const ctx = makeContext({ 'x-e2e-bypass': 'qualquer-coisa' })

    await expect(guard['shouldSkip'](ctx)).resolves.toBe(false)
  })

  it('delega ao super quando o header está ausente ou não bate com o secret', async () => {
    const ctxSemHeader = makeContext({})
    await expect(guard['shouldSkip'](ctxSemHeader)).resolves.toBe(false)

    const ctxHeaderErrado = makeContext({ 'x-e2e-bypass': 'valor-errado' })
    await expect(guard['shouldSkip'](ctxHeaderErrado)).resolves.toBe(false)
  })

  it('retorna true quando NODE_ENV=test, secret setado e header bate', async () => {
    const ctx = makeContext({ 'x-e2e-bypass': BYPASS_SECRET })
    await expect(guard['shouldSkip'](ctx)).resolves.toBe(true)
  })
})
