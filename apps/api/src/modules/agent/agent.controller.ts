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
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Knex } from 'knex'
import { AgentService, EvolutionWebhookPayload } from './agent.service'
import { KNEX } from '@/database/knex.provider'
import { env } from '@/config/env'
import { Public } from '@/common/decorators/public.decorator'

@ApiTags('WhatsApp Agent')
@Public()
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name)

  constructor(
    private readonly agentService: AgentService,
    @Inject(KNEX) private readonly knex: Knex,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook da Evolution API — recebe mensagens WhatsApp e dispara o agente IA' })
  @ApiHeader({
    name: 'apikey',
    description: 'Token de autenticação do webhook (EVOLUTION_WEBHOOK_TOKEN)',
    required: true,
  })
  @ApiBody({
    description: 'Payload da Evolution API (event messages.upsert)',
    schema: {
      type: 'object',
      properties: {
        event: { type: 'string', example: 'messages.upsert' },
        instance: { type: 'string', description: 'Nome da instância Evolution — identifica o tenant' },
        data: {
          type: 'object',
          properties: {
            key: {
              type: 'object',
              properties: {
                remoteJid: { type: 'string', example: '5511999990000@s.whatsapp.net' },
                fromMe: { type: 'boolean', example: false },
              },
            },
            message: {
              type: 'object',
              properties: {
                conversation: { type: 'string', example: 'Olá, gostaria de agendar uma consulta' },
              },
            },
            pushName: { type: 'string', example: 'Maria Silva' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Payload processado (ou ignorado se fromMe=true ou evento não suportado)' })
  @ApiResponse({ status: 401, description: 'apikey inválida ou ausente' })
  async handleWebhook(
    @Headers('apikey') apikey: string | undefined,
    @Body() body: unknown,
  ): Promise<void> {
    if (!apikey || apikey !== env.EVOLUTION_WEBHOOK_TOKEN) {
      throw new UnauthorizedException('Token inválido')
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      !('event' in body) ||
      !('data' in body)
    ) {
      return
    }

    const payload = body as EvolutionWebhookPayload

    if (payload.event !== 'messages.upsert') {
      return
    }

    // Validar campos obrigatórios antes de delegar ao service (payload mal-formado)
    if (!payload.instance) {
      return
    }

    // TD-18: validar remoteJid antes de delegar ao service (payload mal-formado)
    if (!payload.data?.key?.remoteJid) {
      return
    }

    // fromMe=true → doutor mandou mensagem → ativar modo 'human' (handoff)
    if (payload.data.key.fromMe === true) {
      try {
        const remoteJid = payload.data.key.remoteJid
        const phone = remoteJid.replace('@s.whatsapp.net', '')
        const tenantId = await this.knex('agent_settings')
          .where({ enabled: true, evolution_instance_name: payload.instance })
          .select('tenant_id')
          .first()
          .then((row) => (row?.tenant_id as string | undefined) ?? null)
        if (tenantId) {
          await this.agentService.handleDoctorMessage(tenantId, phone)
        }
      } catch (err) {
        this.logger.error(
          `[AgentController] Erro ao ativar handoff — instance=${payload.instance}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      return
    }

    try {
      await this.agentService.handleMessage(payload)
    } catch (err) {
      // Nunca retornar 5xx para a Evolution API — webhook deve sempre receber 200
      this.logger.error(
        `[AgentController] Erro inesperado ao processar webhook — instance=${payload.instance}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

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
   * Webhook Cloud API — Meta envia mensagens recebidas pelos números dos doutores.
   * Validação por HMAC-SHA256 com META_APP_SECRET.
   */
  @Post('webhook/cloud')
  @HttpCode(200)
  @ApiOperation({ summary: 'Meta Cloud API webhook — mensagens WhatsApp recebidas' })
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

    const payload = body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            metadata?: { phone_number_id?: string }
            messages?: Array<{ from?: string; text?: { body?: string }; type?: string }>
          }
        }>
      }>
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value?.metadata?.phone_number_id || !value.messages) continue

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

        for (const msg of value.messages) {
          if (msg.type !== 'text' || !msg.from || !msg.text?.body) continue
          try {
            await this.agentService.handleMessageFromCloud(tenantId, msg.from, msg.text.body)
          } catch (err) {
            this.logger.error(
              `[Cloud webhook] Erro ao processar mensagem para tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
      }
    }
  }
}
