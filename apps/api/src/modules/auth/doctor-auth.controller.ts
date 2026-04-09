import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ResolveEmailSchema, type ResolveEmailDto } from './dto/resolve-email.dto'
import { Throttle } from '@nestjs/throttler'
import { E2eAwareThrottlerGuard } from '@/common/guards/e2e-throttler.guard'
import { DoctorAuthService } from './doctor-auth.service'
import { AcceptDoctorInviteSchema, type AcceptDoctorInviteDto } from './dto/accept-doctor-invite.dto'
import { DoctorLoginSchema, type DoctorLoginDto } from './dto/doctor-login.dto'
import { ForgotPasswordSchema, type ForgotPasswordDto } from './dto/forgot-password.dto'
import { ResetPasswordSchema, type ResetPasswordDto } from './dto/reset-password.dto'
import { RefreshTokenSchema, type RefreshTokenDto } from './dto/refresh-token.dto'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { Public } from '@/common/decorators/public.decorator'

@ApiTags('Doctor Auth')
@Controller('doctor/auth')
export class DoctorAuthController {
  constructor(private readonly doctorAuthService: DoctorAuthService) {}

  // US-1.5: Validar token de convite de doutor (público)
  @Get('invite/:token')
  @Public()
  @ApiOperation({ summary: 'Validar token de convite de doutor (retorna email pré-preenchido)' })
  @ApiParam({ name: 'token', description: 'Token de convite de 64 chars hex' })
  @ApiResponse({ status: 200, description: 'Token válido. Retorna email associado ao convite' })
  @ApiResponse({ status: 400, description: 'Token expirado ou já utilizado' })
  @ApiResponse({ status: 404, description: 'Token não encontrado' })
  validateInviteToken(@Param('token') token: string) {
    return this.doctorAuthService.validateDoctorInviteToken(token)
  }

  // US-1.5: Aceitar convite e criar portal (público)
  @Post('accept-invite')
  @Public()
  @ApiOperation({ summary: 'Aceitar convite de doutor e criar portal (tenant + doctor + agent_settings)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token', 'name', 'password', 'slug'],
      properties: {
        token: { type: 'string', example: 'abc123...' },
        name: { type: 'string', example: 'Dr. João Silva' },
        password: { type: 'string', example: 'Senha123!' },
        slug: { type: 'string', example: 'dr-joao-silva' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Portal criado com sucesso. Retorna accessToken, refreshToken e dados do doutor' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou token expirado/já utilizado' })
  @ApiResponse({ status: 409, description: 'Slug já em uso por outro portal' })
  acceptInvite(
    @Body(new ZodValidationPipe(AcceptDoctorInviteSchema)) dto: AcceptDoctorInviteDto,
  ) {
    return this.doctorAuthService.acceptDoctorInvite(dto.token, dto.name, dto.password, dto.slug)
  }

  // US-1.6: Resolver email antes do login (retorna slug ou hasPendingInvite) — SEC-08 / TD-25
  @Post('resolve-email')
  @Public()
  @UseGuards(E2eAwareThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Resolver email antes do login — retorna slug do portal ou flag de convite pendente' })
  @ApiBody({ schema: { type: 'object', properties: { email: { type: 'string', format: 'email' } }, required: ['email'] } })
  @ApiResponse({ status: 200, description: 'Retorna { slug } ou { hasPendingInvite: true }' })
  @ApiResponse({ status: 404, description: 'Email não encontrado na plataforma' })
  resolveEmail(@Body(new ZodValidationPipe(ResolveEmailSchema)) dto: ResolveEmailDto) {
    return this.doctorAuthService.resolveEmail(dto.email)
  }

  // US-1.6: Login do doutor — SEC-09
  @Post('login')
  @Public()
  @UseGuards(E2eAwareThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Login do doutor' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'dr@clinica.com' },
        password: { type: 'string', example: 'Senha123!' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Login realizado. Retorna accessToken, refreshToken e dados do doutor com onboardingCompleted' })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  login(@Body(new ZodValidationPipe(DoctorLoginSchema)) dto: DoctorLoginDto) {
    return this.doctorAuthService.loginDoctor(dto.email, dto.password)
  }

  // US-1.7: Solicitar redefinição de senha — SEC-09
  @Post('forgot-password')
  @Public()
  @UseGuards(E2eAwareThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Solicitar redefinição de senha do doutor por email' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'dr@clinica.com' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Email de redefinição enviado' })
  @ApiResponse({ status: 400, description: 'Email inválido' })
  forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto) {
    return this.doctorAuthService.forgotPassword(dto.email)
  }

  // US-1.7: Redefinir senha com token — SEC-09
  @Post('reset-password')
  @Public()
  @UseGuards(E2eAwareThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Redefinir senha do doutor com token recebido por email' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token', 'newPassword'],
      properties: {
        token: { type: 'string' },
        newPassword: { type: 'string', example: 'NovaSenha123!' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Senha redefinida com sucesso' })
  @ApiResponse({ status: 400, description: 'Token inválido, expirado ou dados inválidos' })
  resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto) {
    return this.doctorAuthService.resetPassword(dto.token, dto.newPassword)
  }

  // US-1.8: Renovar par de tokens — SEC-18
  @Post('refresh')
  @Public()
  @UseGuards(E2eAwareThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Renovar par de tokens do doutor usando refreshToken' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: { type: 'string', example: 'eyJhbGci...' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Novo par de tokens emitido' })
  @ApiResponse({ status: 401, description: 'refreshToken inválido ou expirado' })
  refresh(@Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto) {
    return this.doctorAuthService.refreshToken(dto.refreshToken)
  }
}
