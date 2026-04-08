import { Injectable, ExecutionContext, Logger } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { env } from '@/config/env'

/**
 * ThrottlerGuard com bypass para Playwright E2E.
 *
 * Quando NODE_ENV === 'test' e o header `x-e2e-bypass` bate com
 * `E2E_THROTTLE_BYPASS_SECRET`, pula o rate limit. Em prod/dev o
 * comportamento é idêntico ao ThrottlerGuard padrão.
 *
 * Motivo: Playwright paralelo estoura o limite de 5 logins/15min do
 * mesmo IP (127.0.0.1), quebrando a suite E2E. Ver TD-29.
 */
@Injectable()
export class E2eAwareThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(E2eAwareThrottlerGuard.name)

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (env.NODE_ENV !== 'test' || !env.E2E_THROTTLE_BYPASS_SECRET) {
      return super.shouldSkip(context)
    }
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>()
    const header = req.headers['x-e2e-bypass']
    if (header && header === env.E2E_THROTTLE_BYPASS_SECRET) {
      this.logger.debug('E2E throttler bypass activated')
      return true
    }
    return super.shouldSkip(context)
  }
}
