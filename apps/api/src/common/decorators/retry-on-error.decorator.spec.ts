jest.mock('@/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-16-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-16-chars',
    DATABASE_URL: 'postgres://test',
    RESEND_API_KEY: 'test',
    FRONTEND_URL: 'http://localhost:5173',
    OPENAI_API_KEY: 'test',
  },
}))

import { RetryOnError } from './retry-on-error.decorator'

describe('RetryOnError', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // CT-TD11-01: Method succeeds on 1st attempt — no retries, returns result
  it('CT-TD11-01: retorna resultado quando método tem sucesso na 1ª tentativa', async () => {
    const mockFn = jest.fn().mockResolvedValue('resultado')

    class TestService {
      @RetryOnError({ maxRetries: 3, baseDelayMs: 100 })
      async doWork() {
        return mockFn()
      }
    }

    const instance = new TestService()
    const promise = instance.doWork()
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('resultado')
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  // CT-TD11-02: Method fails once then succeeds — 1 retry, returns result
  it('CT-TD11-02: retorna resultado após 1 retry quando método falha uma vez', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('falha temporária'))
      .mockResolvedValue('sucesso')

    class TestService {
      @RetryOnError({ maxRetries: 3, baseDelayMs: 100 })
      async doWork() {
        return mockFn()
      }
    }

    const instance = new TestService()
    const promise = instance.doWork()
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('sucesso')
    expect(mockFn).toHaveBeenCalledTimes(2)
  })

  // CT-TD11-03: Method fails all attempts (maxRetries=2) — logs error, returns undefined
  it('CT-TD11-03: retorna undefined e loga erro quando todas as tentativas falham', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('erro persistente'))

    class TestService {
      @RetryOnError({ maxRetries: 2, baseDelayMs: 100 })
      async doWork() {
        return mockFn()
      }
    }

    const instance = new TestService()
    const promise = instance.doWork()
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result).toBeUndefined()
    expect(mockFn).toHaveBeenCalledTimes(3) // 1 attempt + 2 retries
  })

  // CT-TD11-04: Exponential backoff: delays correct (base=100 → 100, 200, 400ms)
  it('CT-TD11-04: aplica backoff exponencial com delays corretos (base=100 → 100, 200, 400ms)', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('sempre falha'))
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout')

    class TestService {
      @RetryOnError({ maxRetries: 3, baseDelayMs: 100, backoff: 'exponential' })
      async doWork() {
        return mockFn()
      }
    }

    const instance = new TestService()
    const promise = instance.doWork()
    await jest.runAllTimersAsync()
    await promise

    const delayArgs = setTimeoutSpy.mock.calls.map((call) => call[1])
    expect(delayArgs).toContain(100) // attempt 0: 100 * 2^0 = 100
    expect(delayArgs).toContain(200) // attempt 1: 100 * 2^1 = 200
    expect(delayArgs).toContain(400) // attempt 2: 100 * 2^2 = 400
  })

  // CT-TD11-05: Linear backoff: delays correct (base=100 → 100, 200, 300ms)
  it('CT-TD11-05: aplica backoff linear com delays corretos (base=100 → 100, 200, 300ms)', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('sempre falha'))
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout')

    class TestService {
      @RetryOnError({ maxRetries: 3, baseDelayMs: 100, backoff: 'linear' })
      async doWork() {
        return mockFn()
      }
    }

    const instance = new TestService()
    const promise = instance.doWork()
    await jest.runAllTimersAsync()
    await promise

    const delayArgs = setTimeoutSpy.mock.calls.map((call) => call[1])
    expect(delayArgs).toContain(100) // attempt 0: 100 * (0+1) = 100
    expect(delayArgs).toContain(200) // attempt 1: 100 * (1+1) = 200
    expect(delayArgs).toContain(300) // attempt 2: 100 * (2+1) = 300
  })

  // CT-TD11-06: Defaults applied when no options (maxRetries=3, base=1000, exponential)
  it('CT-TD11-06: aplica valores padrão quando nenhuma opção é fornecida (maxRetries=3, base=1000, exponential)', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('falha'))
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout')

    class TestService {
      @RetryOnError()
      async doWork() {
        return mockFn()
      }
    }

    const instance = new TestService()
    const promise = instance.doWork()
    await jest.runAllTimersAsync()
    await promise

    // 4 calls total: 1 original + 3 retries
    expect(mockFn).toHaveBeenCalledTimes(4)

    // Delays from exponential backoff with base=1000: 1000, 2000, 4000
    const delayArgs = setTimeoutSpy.mock.calls.map((call) => call[1])
    expect(delayArgs).toContain(1000) // 1000 * 2^0
    expect(delayArgs).toContain(2000) // 1000 * 2^1
    expect(delayArgs).toContain(4000) // 1000 * 2^2
  })

  // CT-TD11-07: `this` context preserved — decorated method accesses instance properties
  it('CT-TD11-07: preserva o contexto `this` — método decorado acessa propriedades da instância', async () => {
    class TestService {
      public value = 'valor-da-instancia'

      @RetryOnError({ maxRetries: 1, baseDelayMs: 10 })
      async getValue() {
        return this.value
      }
    }

    const instance = new TestService()
    const promise = instance.getValue()
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('valor-da-instancia')
  })

  // CT-TD11-08: Early return (no throw) does not trigger retry
  it('CT-TD11-08: retorno antecipado sem lançar exceção não aciona retry', async () => {
    const mockFn = jest.fn().mockResolvedValue(undefined)

    class TestService {
      @RetryOnError({ maxRetries: 3, baseDelayMs: 100 })
      async doWork() {
        return mockFn()
      }
    }

    const instance = new TestService()
    const promise = instance.doWork()
    await jest.runAllTimersAsync()
    await promise

    // Should only be called once — no retries triggered
    expect(mockFn).toHaveBeenCalledTimes(1)
  })
})
