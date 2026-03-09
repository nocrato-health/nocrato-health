import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
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

@ApiTags('Doctor Agent Settings')
@ApiBearerAuth()
@Controller('doctor/agent-settings')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class AgentSettingsController {
  constructor(private readonly agentSettingsService: AgentSettingsService) {}

  // US-8.1: Leitura das configurações do agente WhatsApp
  @Get()
  @ApiOperation({ summary: 'Retorna configurações do agente WhatsApp do tenant' })
  @ApiResponse({ status: 200, description: 'Configurações do agente (enabled, bookingMode, mensagens)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Configurações não encontradas para este tenant' })
  getAgentSettings(@TenantId() tenantId: string) {
    return this.agentSettingsService.getAgentSettings(tenantId)
  }

  // US-8.1: Atualização parcial das configurações do agente WhatsApp
  @Patch()
  @ApiOperation({ summary: 'Atualizar parcialmente as configurações do agente WhatsApp' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', example: true },
        bookingMode: { type: 'string', enum: ['link', 'chat', 'both'], example: 'both' },
        welcomeMessage: { type: 'string', example: 'Olá! Sou o assistente do Dr. João.' },
        unavailableMessage: { type: 'string', example: 'No momento não posso atender.' },
        confirmationMessage: { type: 'string', example: 'Sua consulta foi confirmada!' },
        cancellationMessage: { type: 'string', example: 'Sua consulta foi cancelada.' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Configurações atualizadas' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  updateAgentSettings(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(UpdateAgentSettingsV2Schema)) dto: UpdateAgentSettingsV2Dto,
  ) {
    return this.agentSettingsService.updateAgentSettings(tenantId, dto)
  }
}
