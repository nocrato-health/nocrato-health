import { Controller, Post, Headers, Body, HttpCode, UnauthorizedException } from '@nestjs/common'
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AgentService, EvolutionWebhookPayload } from './agent.service'
import { env } from '@/config/env'

@ApiTags('WhatsApp Agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

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

    if (payload.data.key.fromMe === true) {
      return
    }

    await this.agentService.handleMessage(payload)
  }
}
