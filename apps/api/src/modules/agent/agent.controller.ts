import {
  Controller,
  Post,
  Get,
  Headers,
  Body,
  Query,
  HttpCode,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Knex } from 'knex'
import { AgentService } from './agent.service'
import { KNEX } from '@/database/knex.provider'
import { env } from '@/config/env'
import { Public } from '@/common/decorators/public.decorator'

// ---------------------------------------------------------------------------
// Tipos do payload Cloud API
// ---------------------------------------------------------------------------

interface CloudStatus {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  recipient_id: string
  timestamp: string
}

interface CloudWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string }
        messages?: Array<{ from?: string; text?: { body?: string }; type?: string }>
        statuses?: CloudStatus[]
      }
    }>
  }>
}

@ApiTags('WhatsApp Agent')
@Public()
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name)

  constructor(
    private readonly agentService: AgentService,
    @Inject(KNEX) private readonly knex: Knex,
  ) {}

  /**
   * Webhook Verification (handshake inicial) — Meta envia GET pra confirmar
   * que somos donos do endpoint. Devemos retornar o `hub.challenge` se o token bate.
   */
  @Get('webhook/cloud')
  @HttpCode(200)
  @ApiOperation({ summary: 'Meta Cloud API webhook verification challenge' })
  verifyCloudWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    if (mode === 'subscribe' && token && token === env.META_WEBHOOK_VERIFY_TOKEN) {
      return challenge ?? ''
    }
    throw new UnauthorizedException('Token de verificação inválido')
  }

  /**
   * Webhook Cloud API — Meta envia mensagens recebidas e statuses de envio.
   * Validação por HMAC-SHA256 com META_APP_SECRET.
   *
   * - `messages` → paciente enviou mensagem → dispara agente IA
   * - `statuses[].status === 'sent'` → business account enviou mensagem (doutor respondeu) → ativa handoff human
   */
  @Post('webhook/cloud')
  @HttpCode(200)
  @ApiOperation({ summary: 'Meta Cloud API webhook — mensagens e statuses WhatsApp' })
  @ApiResponse({ status: 200, description: 'Payload processado' })
  @ApiResponse({ status: 401, description: 'Assinatura HMAC inválida ou ausente' })
  async handleCloudWebhook(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ): Promise<void> {
    if (!env.META_APP_SECRET) {
      this.logger.error('META_APP_SECRET não configurado — webhook Cloud rejeitado')
      throw new UnauthorizedException('Webhook não configurado')
    }
    if (!signature || !signature.startsWith('sha256=')) {
      throw new UnauthorizedException('Assinatura ausente ou inválida')
    }

    const rawBody = JSON.stringify(body)
    const expected = createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex')
    const provided = signature.replace('sha256=', '')

    let isValid = false
    try {
      isValid =
        expected.length === provided.length &&
        timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    } catch {
      isValid = false
    }

    if (!isValid) {
      throw new UnauthorizedException('Assinatura HMAC inválida')
    }

    if (typeof body !== 'object' || body === null || !('entry' in body)) {
      return
    }

    const payload = body as CloudWebhookPayload

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value?.metadata?.phone_number_id) continue

        const phoneNumberId = value.metadata.phone_number_id

        // Resolve tenant via phone_number_id
        const settings = await this.knex('agent_settings')
          .select('tenant_id')
          .where({ whatsapp_phone_number_id: phoneNumberId })
          .first()

        if (!settings) {
          this.logger.warn(
            `[Cloud webhook] phone_number_id ${phoneNumberId} não corresponde a nenhum tenant — ignorado`,
          )
          continue
        }

        const tenantId = settings.tenant_id as string

        // Processar mensagens recebidas (paciente → agente IA)
        for (const msg of value.messages ?? []) {
          if (msg.type !== 'text' || !msg.from || !msg.text?.body) continue
          try {
            await this.agentService.handleMessageFromCloud(tenantId, msg.from, msg.text.body)
          } catch (err) {
            this.logger.error(
              `[Cloud webhook] Erro ao processar mensagem para tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }

        // Processar statuses: 'sent' indica que a business account enviou mensagem
        // (o doutor respondeu via WhatsApp Business) → ativar modo human (handoff)
        for (const status of value.statuses ?? []) {
          if (status.status === 'sent' && status.recipient_id) {
            try {
              await this.agentService.handleDoctorMessage(tenantId, status.recipient_id)
            } catch (err) {
              this.logger.error(
                `[Cloud webhook] Erro ao ativar handoff para tenant ${tenantId} phone=${status.recipient_id}: ${err instanceof Error ? err.message : String(err)}`,
              )
            }
          }
        }
      }
    }
  }
}
