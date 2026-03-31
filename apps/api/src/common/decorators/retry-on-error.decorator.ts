import { Logger } from '@nestjs/common'

export interface RetryOnErrorOptions {
  maxRetries?: number
  baseDelayMs?: number
  backoff?: 'exponential' | 'linear'
}

export function RetryOnError(options?: RetryOnErrorOptions): MethodDecorator {
  const maxRetries = options?.maxRetries ?? 3
  const baseDelayMs = options?.baseDelayMs ?? 1000
  const backoff = options?.backoff ?? 'exponential'

  return function (
    _target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) {
    const originalMethod = descriptor.value
    const logger = new Logger('RetryOnError')

    descriptor.value = async function (...args: unknown[]) {
      let lastError: unknown

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await originalMethod.apply(this, args)
        } catch (error) {
          lastError = error

          if (attempt < maxRetries) {
            const delay =
              backoff === 'exponential'
                ? baseDelayMs * Math.pow(2, attempt)
                : baseDelayMs * (attempt + 1)

            logger.warn(
              `[${String(propertyKey)}] Tentativa ${attempt + 1}/${maxRetries + 1} falhou. ` +
                `Retry em ${delay}ms... Erro: ${error instanceof Error ? error.message : String(error)}`,
            )

            await new Promise((resolve) => setTimeout(resolve, delay))
          }
        }
      }

      logger.error(
        `[${String(propertyKey)}] Todas ${maxRetries + 1} tentativas falharam. ` +
          `Erro: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      )
    }

    return descriptor
  }
}
