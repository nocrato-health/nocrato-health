import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { TenantId } from '@/common/decorators/tenant.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { ProfileService } from './profile.service'
import {
  UpdateProfileSettingsSchema,
  type UpdateProfileSettingsDto,
} from './dto/update-profile-settings.dto'
import {
  UpdateBrandingSettingsSchema,
  type UpdateBrandingSettingsDto,
} from './dto/update-branding-settings.dto'

@ApiTags('Doctor Profile')
@ApiBearerAuth()
@Controller('doctor/profile')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  // US-8.2: Retorna perfil completo do doutor (sem password_hash) + branding do tenant
  @Get()
  @ApiOperation({ summary: 'Retorna perfil completo do doutor e branding do tenant' })
  @ApiResponse({ status: 200, description: 'Perfil do doutor com dados do tenant (primaryColor, logoUrl)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  getProfile(@TenantId() tenantId: string) {
    return this.profileService.getProfile(tenantId)
  }

  // US-8.2: Atualiza parcialmente o perfil do doutor (name, specialty, phone, workingHours, timezone)
  @Patch()
  @ApiOperation({ summary: 'Atualizar parcialmente o perfil do doutor' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Dr. João Silva' },
        specialty: { type: 'string', example: 'Cardiologia' },
        phone: { type: 'string', example: '11999990000' },
        workingHours: { type: 'object', description: 'Horários de atendimento por dia da semana' },
        timezone: { type: 'string', example: 'America/Sao_Paulo' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Perfil atualizado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  updateProfile(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(UpdateProfileSettingsSchema)) dto: UpdateProfileSettingsDto,
  ) {
    return this.profileService.updateProfile(tenantId, dto)
  }

  // US-8.2: Atualiza parcialmente o branding do tenant (primaryColor, logoUrl)
  @Patch('branding')
  @ApiOperation({ summary: 'Atualizar branding do tenant (cor primária e logo)' })
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
    @Body(new ZodValidationPipe(UpdateBrandingSettingsSchema)) dto: UpdateBrandingSettingsDto,
  ) {
    return this.profileService.updateBranding(tenantId, dto)
  }
}
