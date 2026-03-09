import { Controller, Post, Headers, Body, HttpCode, UnauthorizedException } from '@nestjs/common'
import { AgentService, EvolutionWebhookPayload } from './agent.service'
import { env } from '@/config/env'

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('webhook')
  @HttpCode(200)
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
