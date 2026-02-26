import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common'
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

@Controller('api/v1')
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  // US-1.2: Convidar colaborador da agência
  // Protegido: somente agency_admin autenticado
  @Post('agency/members/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('agency_admin')
  inviteAgencyMember(
    @Body(new ZodValidationPipe(InviteAgencyMemberSchema)) dto: InviteAgencyMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inviteService.inviteAgencyMember(dto.email, user.sub)
  }

  // US-1.3: Validar token de convite (público)
  @Get('agency/auth/invite/:token')
  validateInviteToken(@Param('token') token: string) {
    return this.inviteService.validateInviteToken(token)
  }

  // US-1.3: Aceitar convite e criar senha (público)
  @Post('agency/auth/accept-invite')
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
  inviteDoctor(
    @Body(new ZodValidationPipe(InviteDoctorSchema)) dto: InviteDoctorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inviteService.inviteDoctor(dto.email, user.sub)
  }
}
