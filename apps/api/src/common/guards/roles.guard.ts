import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '@/common/decorators/roles.decorator'
import type { JwtPayload } from '@/modules/auth/strategies/jwt.strategy'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user: JwtPayload = request.user

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Acesso negado: permissão insuficiente')
    }

    return true
  }
}
