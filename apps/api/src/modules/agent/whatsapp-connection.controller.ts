import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { TenantId } from '@/common/decorators/tenant.decorator'
import {
  CLOUD_API_CONNECTION_PROVIDER,
  type SignupBasedConnectionProvider,
} from './whatsapp-connection.provider'
import { ConversationService, type ConversationMode } from './conversation.service'

const ConnectCloudSchema = z.object({
  code: z.string().min(10, 'Code OAuth da Meta inválido'),
})

const SetConversationModeSchema = z.object({
  mode: z.enum(['agent', 'human']),
})

@Controller('doctor/whatsapp')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class WhatsAppConnectionController {
  private readonly logger = new Logger(WhatsAppConnectionController.name)

  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    @Inject(CLOUD_API_CONNECTION_PROVIDER)
    private readonly cloudProvider: SignupBasedConnectionProvider,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Conexão via Embedded Signup da Meta (WhatsApp Cloud API).
   * Recebe o `code` OAuth do popup do frontend e troca por phone_number_id + waba_id.
   */
  @Post('connect-cloud')
  async connectCloud(
    @TenantId() tenantId: string,
    @Body() body: unknown,
  ) {
    const parsed = ConnectCloudSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException('Code OAuth inválido')
    }

    const agentSettings = await this.knex('agent_settings')
      .select('id')
      .where({ tenant_id: tenantId })
      .first()

    if (!agentSettings) {
      throw new NotFoundException('Configurações do agente não encontradas')
    }

    const result = await this.cloudProvider.exchangeSignupCode(parsed.data.code)

    await this.knex('agent_settings')
      .where({ tenant_id: tenantId })
      .update({
        whatsapp_phone_number_id: result.phoneNumberId,
        whatsapp_waba_id: result.wabaId,
        whatsapp_display_phone_number: result.displayPhoneNumber,
        whatsapp_verified_name: result.verifiedName,
        updated_at: this.knex.fn.now(),
      })

    this.logger.log(`Cloud API conectada para tenant ${tenantId}: ${result.displayPhoneNumber}`)

    return {
      phoneNumber: result.displayPhoneNumber,
      verifiedName: result.verifiedName,
      status: 'connected' as const,
    }
  }

  /**
   * PATCH /api/v1/doctor/whatsapp/conversations/:phone/mode
   *
   * Permite ao doutor alternar manualmente entre modo agente e modo humano.
   */
  @Patch('conversations/:phone/mode')
  @HttpCode(200)
  async setConversationMode(
    @TenantId() tenantId: string,
    @Param('phone') phone: string,
    @Body() body: unknown,
  ) {
    const parsed = SetConversationModeSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException('Modo inválido. Use "agent" ou "human".')
    }

    await this.conversationService.setMode(tenantId, phone, parsed.data.mode as ConversationMode)

    return { phone, mode: parsed.data.mode }
  }
}
