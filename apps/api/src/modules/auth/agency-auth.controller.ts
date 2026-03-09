import { Controller, Post, Body } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AgencyAuthService } from './agency-auth.service'
import { AgencyLoginSchema, type AgencyLoginDto } from './dto/agency-login.dto'
import { ForgotPasswordSchema, type ForgotPasswordDto } from './dto/forgot-password.dto'
import { ResetPasswordSchema, type ResetPasswordDto } from './dto/reset-password.dto'
import { RefreshTokenSchema, type RefreshTokenDto } from './dto/refresh-token.dto'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'

@ApiTags('Agency Auth')
@Controller('agency/auth')
export class AgencyAuthController {
  constructor(private readonly agencyAuthService: AgencyAuthService) {}

  // US-1.1: Login da agência
  @Post('login')
  @ApiOperation({ summary: 'Login de membro da agência' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'admin@nocrato.com' },
        password: { type: 'string', example: 'Senha123!' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Login realizado com sucesso. Retorna accessToken e refreshToken' })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  login(@Body(new ZodValidationPipe(AgencyLoginSchema)) dto: AgencyLoginDto) {
    return this.agencyAuthService.loginAgency(dto.email, dto.password)
  }

  // US-1.7: Solicitar redefinição de senha
  @Post('forgot-password')
  @ApiOperation({ summary: 'Solicitar redefinição de senha por email' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'admin@nocrato.com' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Email de redefinição enviado (sempre, independente se o email existe)' })
  @ApiResponse({ status: 400, description: 'Email inválido' })
  forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto) {
    return this.agencyAuthService.forgotPassword(dto.email)
  }

  // US-1.7: Redefinir senha com token
  @Post('reset-password')
  @ApiOperation({ summary: 'Redefinir senha com token recebido por email' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token', 'newPassword'],
      properties: {
        token: { type: 'string', example: 'abc123...' },
        newPassword: { type: 'string', example: 'NovaSenha123!' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Senha redefinida com sucesso' })
  @ApiResponse({ status: 400, description: 'Token inválido, expirado ou dados de entrada inválidos' })
  resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto) {
    return this.agencyAuthService.resetPassword(dto.token, dto.newPassword)
  }

  // US-1.8: Renovar par de tokens
  @Post('refresh')
  @ApiOperation({ summary: 'Renovar par de tokens usando refreshToken' })
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
    return this.agencyAuthService.refreshToken(dto.refreshToken)
  }
}
