import { Controller, Post, Body } from '@nestjs/common'
import { AgencyAuthService } from './agency-auth.service'
import { AgencyLoginSchema, type AgencyLoginDto } from './dto/agency-login.dto'
import { ForgotPasswordSchema, type ForgotPasswordDto } from './dto/forgot-password.dto'
import { ResetPasswordSchema, type ResetPasswordDto } from './dto/reset-password.dto'
import { RefreshTokenSchema, type RefreshTokenDto } from './dto/refresh-token.dto'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'

@Controller('api/v1/agency/auth')
export class AgencyAuthController {
  constructor(private readonly agencyAuthService: AgencyAuthService) {}

  // US-1.1: Login da agência
  @Post('login')
  login(@Body(new ZodValidationPipe(AgencyLoginSchema)) dto: AgencyLoginDto) {
    return this.agencyAuthService.loginAgency(dto.email, dto.password)
  }

  // US-1.7: Solicitar redefinição de senha
  @Post('forgot-password')
  forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto) {
    return this.agencyAuthService.forgotPassword(dto.email)
  }

  // US-1.7: Redefinir senha com token
  @Post('reset-password')
  resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto) {
    return this.agencyAuthService.resetPassword(dto.token, dto.newPassword)
  }

  // US-1.8: Renovar par de tokens
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto) {
    return this.agencyAuthService.refreshToken(dto.refreshToken)
  }
}
