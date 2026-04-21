import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { env } from '@/config/env'
import {
  WHATSAPP_CONNECTION_PROVIDER,
  CLOUD_API_CONNECTION_PROVIDER,
  type WhatsAppConnectionProvider,
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
    @Inject(WHATSAPP_CONNECTION_PROVIDER)
    private readonly connectionProvider: WhatsAppConnectionProvider,
    @Inject(CLOUD_API_CONNECTION_PROVIDER)
    private readonly cloudProvider: SignupBasedConnectionProvider,
    private readonly conversationService: ConversationService,
  ) {}

  private buildWebhookUrl(): string {
    return `${env.WEBHOOK_BASE_URL}/api/v1/agent/webhook`
  }

  @Post('connect')
  async connect(@TenantId() tenantId: string) {
    const agentSettings = await this.knex('agent_settings')
      .select('evolution_instance_name')
      .where({ tenant_id: tenantId })
      .first()

    if (!agentSettings) {
      throw new NotFoundException('Configurações do agente não encontradas')
    }

    let instanceName: string = agentSettings.evolution_instance_name as string | null ?? ''

    if (!instanceName) {
      const tenant = await this.knex('tenants').select('slug').where({ id: tenantId }).first()
      if (!tenant) {
        throw new NotFoundException('Tenant não encontrado')
      }
      instanceName = `tenant-${tenant.slug as string}`

      await this.knex('agent_settings')
        .where({ tenant_id: tenantId })
        .update({ evolution_instance_name: instanceName, updated_at: this.knex.fn.now() })

      this.logger.log(`Nome de instância gerado e salvo para tenant ${tenantId}: ${instanceName}`)
    }

    const webhookUrl = this.buildWebhookUrl()
    const connectionResult = await this.connectionProvider.createInstance(instanceName, webhookUrl)
    const qrResult = await this.connectionProvider.getQrCode(instanceName)

    return {
      instanceName: connectionResult.instanceName,
      qrCode: qrResult.qrCode,
      status: qrResult.status,
    }
  }

  @Get('status')
  async getStatus(@TenantId() tenantId: string) {
    const agentSettings = await this.knex('agent_settings')
      .select('evolution_instance_name')
      .where({ tenant_id: tenantId })
      .first()

    if (!agentSettings || !(agentSettings.evolution_instance_name as string | null)) {
      return { status: 'not_configured' }
    }

    const instanceName = agentSettings.evolution_instance_name as string
    return this.connectionProvider.getConnectionStatus(instanceName)
  }

  @Get('qr')
  async getQrCode(@TenantId() tenantId: string) {
    const agentSettings = await this.knex('agent_settings')
      .select('evolution_instance_name')
      .where({ tenant_id: tenantId })
      .first()

    if (!agentSettings || !(agentSettings.evolution_instance_name as string | null)) {
      throw new NotFoundException('Instância WhatsApp não configurada')
    }

    const instanceName = agentSettings.evolution_instance_name as string
    return this.connectionProvider.getQrCode(instanceName)
  }

  @Delete('disconnect')
  @HttpCode(204)
  async disconnect(@TenantId() tenantId: string): Promise<void> {
    const agentSettings = await this.knex('agent_settings')
      .select('evolution_instance_name', 'whatsapp_phone_number_id')
      .where({ tenant_id: tenantId })
      .first()

    if (!agentSettings) {
      throw new NotFoundException('Instância WhatsApp não configurada')
    }

    const cloudPhoneNumberId = agentSettings.whatsapp_phone_number_id as string | null
    const evolutionInstance = agentSettings.evolution_instance_name as string | null

    // Cloud API tem precedência se ambos configurados
    if (cloudPhoneNumberId) {
      await this.knex('agent_settings')
        .where({ tenant_id: tenantId })
        .update({
          whatsapp_phone_number_id: null,
          whatsapp_waba_id: null,
          whatsapp_display_phone_number: null,
          whatsapp_verified_name: null,
          updated_at: this.knex.fn.now(),
        })
      return
    }

    if (evolutionInstance) {
      await this.connectionProvider.disconnectInstance(evolutionInstance)
      return
    }

    throw new NotFoundException('Instância WhatsApp não configurada')
  }

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
   * Útil como atalho: "Devolver ao agente" sem esperar o timeout de 30min.
   */
  @Patch('conversations/:phone/mode')
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
