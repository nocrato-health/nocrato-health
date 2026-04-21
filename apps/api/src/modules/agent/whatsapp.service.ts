import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { env } from '@/config/env'

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)

  /**
   * Envia mensagem via Meta Cloud API.
   * Usa o SYSTEM_USER_TOKEN da Nocrato (token permanente de nível de sistema).
   *
   * @param phoneNumberId — whatsapp_phone_number_id do tenant (agent_settings)
   * @param phone — número do destinatário (formato internacional, sem +)
   * @param text — corpo da mensagem
   */
  async sendViaCloud(phoneNumberId: string, phone: string, text: string): Promise<void> {
    if (!env.META_SYSTEM_USER_TOKEN) {
      throw new InternalServerErrorException(
        'META_SYSTEM_USER_TOKEN não configurado — impossível enviar via Cloud API',
      )
    }

    const url = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${phoneNumberId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.META_SYSTEM_USER_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '(corpo indisponível)')
      const maskedPhone = phone.length > 4 ? `****${phone.slice(-4)}` : '****'
      this.logger.error(
        `Falha ao enviar via Cloud API para ${maskedPhone}: HTTP ${response.status} — ${errorBody}`,
      )
      throw new Error(`Meta Cloud API retornou HTTP ${response.status}`)
    }
  }
}
