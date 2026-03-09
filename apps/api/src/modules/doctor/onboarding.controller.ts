import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { OnboardingService } from './onboarding.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { TenantId } from '@/common/decorators/tenant.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { UpdateProfileSchema, UpdateProfileDto } from './dto/update-profile.dto'
import { UpdateScheduleSchema, UpdateScheduleDto } from './dto/update-schedule.dto'
import { UpdateBrandingSchema, UpdateBrandingDto } from './dto/update-branding.dto'
import { UpdateAgentSettingsSchema, UpdateAgentSettingsDto } from './dto/update-agent-settings.dto'

@ApiTags('Doctor Onboarding')
@ApiBearerAuth()
@Controller('doctor/onboarding')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // US-3.1: Status do wizard de onboarding
  @Get('status')
  @ApiOperation({ summary: 'Retorna progresso do wizard de onboarding (steps 1-4 + completed)' })
  @ApiResponse({ status: 200, description: 'Status do onboarding com currentStep e flags de cada step' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  getStatus(@TenantId() tenantId: string) {
    return this.onboardingService.getOnboardingStatus(tenantId)
  }

  // US-3.1: Atualização do perfil do doutor (step 1)
  @Patch('profile')
  @ApiOperation({ summary: 'Atualizar perfil do doutor (step 1 do onboarding)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Dr. João Silva' },
        crm: { type: 'string', example: 'CRM-SP 12345' },
        specialty: { type: 'string', example: 'Cardiologia' },
        phone: { type: 'string', example: '11999990000' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Perfil atualizado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  updateProfile(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileDto,
  ) {
    return this.onboardingService.updateProfile(tenantId, body)
  }

  // US-3.1: Atualização da agenda (step 2)
  @Patch('schedule')
  @ApiOperation({ summary: 'Atualizar horários de atendimento do doutor (step 2 do onboarding)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        workingHours: {
          type: 'object',
          description: 'Objeto com dias da semana e intervalos de horário',
          example: { monday: [{ start: '09:00', end: '17:00' }] },
        },
        appointmentDuration: { type: 'number', example: 30 },
        timezone: { type: 'string', example: 'America/Sao_Paulo' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Agenda atualizada' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  updateSchedule(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(UpdateScheduleSchema)) body: UpdateScheduleDto,
  ) {
    return this.onboardingService.updateSchedule(tenantId, body)
  }

  // US-3.1: Atualização de branding do tenant (step 3)
  @Patch('branding')
  @ApiOperation({ summary: 'Atualizar branding do portal do doutor (step 3 do onboarding)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        primaryColor: { type: 'string', example: '#3B82F6' },
        logoUrl: { type: 'string', example: 'https://...' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Branding atualizado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  updateBranding(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(UpdateBrandingSchema)) body: UpdateBrandingDto,
  ) {
    return this.onboardingService.updateBranding(tenantId, body)
  }

  // US-3.1: Upsert das configurações do agente WhatsApp (step 4)
  @Patch('agent')
  @ApiOperation({ summary: 'Configurar agente WhatsApp (step 4 do onboarding)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        welcomeMessage: { type: 'string', example: 'Olá! Sou o assistente do Dr. João.' },
        bookingMode: { type: 'string', enum: ['link', 'chat', 'both'], example: 'both' },
        enabled: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Configurações do agente salvas' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  updateAgentSettings(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(UpdateAgentSettingsSchema)) body: UpdateAgentSettingsDto,
  ) {
    return this.onboardingService.updateAgentSettings(tenantId, body)
  }

  // US-3.1: Conclusão do onboarding (valida steps obrigatórios e marca como completo)
  @Post('complete')
  @ApiOperation({ summary: 'Concluir onboarding (valida steps 1 e 2 obrigatórios)' })
  @ApiResponse({ status: 201, description: 'Onboarding concluído com sucesso' })
  @ApiResponse({ status: 400, description: 'Steps obrigatórios incompletos (perfil e agenda)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  completeOnboarding(@TenantId() tenantId: string) {
    return this.onboardingService.completeOnboarding(tenantId)
  }
}
