import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import type { JwtPayload } from '@/modules/auth/strategies/jwt.strategy'

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user: JwtPayload = request.user

    if (!user?.tenantId) {
      throw new ForbiddenException('Acesso negado: tenant não identificado no token')
    }

    return true
  }
}
