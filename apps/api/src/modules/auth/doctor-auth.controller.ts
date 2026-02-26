import { Controller, Post, Get, Body, Param } from '@nestjs/common'
import { DoctorAuthService } from './doctor-auth.service'
import { AcceptDoctorInviteSchema, type AcceptDoctorInviteDto } from './dto/accept-doctor-invite.dto'
import { DoctorLoginSchema, type DoctorLoginDto } from './dto/doctor-login.dto'
import { ForgotPasswordSchema, type ForgotPasswordDto } from './dto/forgot-password.dto'
import { ResetPasswordSchema, type ResetPasswordDto } from './dto/reset-password.dto'
import { RefreshTokenSchema, type RefreshTokenDto } from './dto/refresh-token.dto'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'

@Controller('api/v1/doctor/auth')
export class DoctorAuthController {
  constructor(private readonly doctorAuthService: DoctorAuthService) {}

  // US-1.5: Validar token de convite de doutor (público)
  @Get('invite/:token')
  validateInviteToken(@Param('token') token: string) {
    return this.doctorAuthService.validateDoctorInviteToken(token)
  }

  // US-1.5: Aceitar convite e criar portal (público)
  @Post('accept-invite')
  acceptInvite(
    @Body(new ZodValidationPipe(AcceptDoctorInviteSchema)) dto: AcceptDoctorInviteDto,
  ) {
    return this.doctorAuthService.acceptDoctorInvite(dto.token, dto.name, dto.password, dto.slug)
  }

  // US-1.6: Resolver email antes do login (retorna slug ou hasPendingInvite)
  @Get('resolve-email/:email')
  resolveEmail(@Param('email') email: string) {
    return this.doctorAuthService.resolveEmail(email)
  }

  // US-1.6: Login do doutor
  @Post('login')
  login(@Body(new ZodValidationPipe(DoctorLoginSchema)) dto: DoctorLoginDto) {
    return this.doctorAuthService.loginDoctor(dto.email, dto.password)
  }

  // US-1.7: Solicitar redefinição de senha
  @Post('forgot-password')
  forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto) {
    return this.doctorAuthService.forgotPassword(dto.email)
  }

  // US-1.7: Redefinir senha com token
  @Post('reset-password')
  resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto) {
    return this.doctorAuthService.resetPassword(dto.token, dto.newPassword)
  }

  // US-1.8: Renovar par de tokens
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto) {
    return this.doctorAuthService.refreshToken(dto.refreshToken)
  }
}
