import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { TenantId } from '@/common/decorators/tenant.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { AgentSettingsService } from './agent-settings.service'
import {
  UpdateAgentSettingsV2Schema,
  type UpdateAgentSettingsV2Dto,
} from './dto/update-agent-settings-v2.dto'

@Controller('doctor/agent-settings')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class AgentSettingsController {
  constructor(private readonly agentSettingsService: AgentSettingsService) {}

  // US-8.1: Leitura das configurações do agente WhatsApp
  @Get()
  getAgentSettings(@TenantId() tenantId: string) {
    return this.agentSettingsService.getAgentSettings(tenantId)
  }

  // US-8.1: Atualização parcial das configurações do agente WhatsApp
  @Patch()
  updateAgentSettings(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(UpdateAgentSettingsV2Schema)) dto: UpdateAgentSettingsV2Dto,
  ) {
    return this.agentSettingsService.updateAgentSettings(tenantId, dto)
  }
}
