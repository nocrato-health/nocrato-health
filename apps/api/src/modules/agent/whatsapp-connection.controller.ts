import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common'
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
  type WhatsAppConnectionProvider,
} from './whatsapp-connection.provider'

@Controller('doctor/whatsapp')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class WhatsAppConnectionController {
  private readonly logger = new Logger(WhatsAppConnectionController.name)

  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    @Inject(WHATSAPP_CONNECTION_PROVIDER)
    private readonly connectionProvider: WhatsAppConnectionProvider,
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
      .select('evolution_instance_name')
      .where({ tenant_id: tenantId })
      .first()

    if (!agentSettings || !(agentSettings.evolution_instance_name as string | null)) {
      throw new NotFoundException('Instância WhatsApp não configurada')
    }

    const instanceName = agentSettings.evolution_instance_name as string
    await this.connectionProvider.disconnectInstance(instanceName)
  }
}
