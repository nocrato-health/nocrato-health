import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { InviteService } from './invite.service'
import { InviteAgencyMemberSchema, type InviteAgencyMemberDto } from './dto/invite-agency-member.dto'
import { AcceptInviteSchema, type AcceptInviteDto } from './dto/accept-invite.dto'
import { InviteDoctorSchema, type InviteDoctorDto } from './dto/invite-doctor.dto'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@/modules/auth/strategies/jwt.strategy'

@ApiTags('Invites')
@Controller('')
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  // US-1.2: Convidar colaborador da agência
  // Protegido: somente agency_admin autenticado
  @Post('agency/members/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('agency_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Convidar novo colaborador para a agência (agency_admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'colaborador@nocrato.com' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Convite enviado por email' })
  @ApiResponse({ status: 400, description: 'Email inválido' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 409, description: 'Já existe convite pendente para este email' })
  inviteAgencyMember(
    @Body(new ZodValidationPipe(InviteAgencyMemberSchema)) dto: InviteAgencyMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inviteService.inviteAgencyMember(dto.email, user.sub)
  }

  // US-1.3: Validar token de convite (público)
  @Get('agency/auth/invite/:token')
  @ApiOperation({ summary: 'Validar token de convite de membro da agência (retorna email)' })
  @ApiParam({ name: 'token', description: 'Token de convite de 64 chars hex' })
  @ApiResponse({ status: 200, description: 'Token válido. Retorna email associado ao convite' })
  @ApiResponse({ status: 400, description: 'Token expirado ou já utilizado' })
  @ApiResponse({ status: 404, description: 'Token não encontrado' })
  validateInviteToken(@Param('token') token: string) {
    return this.inviteService.validateInviteToken(token)
  }

  // US-1.3: Aceitar convite e criar senha (público)
  @Post('agency/auth/accept-invite')
  @ApiOperation({ summary: 'Aceitar convite de membro da agência e definir senha' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token', 'name', 'password'],
      properties: {
        token: { type: 'string', example: 'abc123...' },
        name: { type: 'string', example: 'Colaborador Nome' },
        password: { type: 'string', example: 'Senha123!' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Conta criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Token inválido, expirado ou já utilizado' })
  acceptInvite(
    @Body(new ZodValidationPipe(AcceptInviteSchema)) dto: AcceptInviteDto,
  ) {
    return this.inviteService.acceptInvite(dto.token, dto.name, dto.password)
  }

  // US-1.4: Convidar doutor
  // Protegido: somente agency_admin autenticado
  @Post('agency/doctors/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('agency_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Convidar doutor para criar portal na plataforma (agency_admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'dr@clinica.com' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Convite enviado por email ao doutor' })
  @ApiResponse({ status: 400, description: 'Email inválido' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 409, description: 'Já existe convite pendente para este email' })
  inviteDoctor(
    @Body(new ZodValidationPipe(InviteDoctorSchema)) dto: InviteDoctorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inviteService.inviteDoctor(dto.email, user.sub)
  }
}
