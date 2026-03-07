import { Injectable, Logger } from '@nestjs/common'
import { env } from '@/config/env'

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)

  async sendText(phone: string, text: string): Promise<void> {
    const url = `${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ number: phone, text }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '(corpo indisponível)')
      this.logger.error(
        `Falha ao enviar mensagem WhatsApp para ${phone}: HTTP ${response.status} — ${errorBody}`,
      )
      throw new Error(`Evolution API retornou HTTP ${response.status}`)
    }
  }
}
