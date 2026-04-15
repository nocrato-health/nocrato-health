import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { env } from '@/config/env'

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)

  /**
   * Envia mensagem via Meta Cloud API.
   * Usa o SYSTEM_USER_TOKEN da Nocrato (token permanente de nível de sistema).
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

  async sendText(phone: string, text: string, instanceName: string): Promise<void> {
    // SEC-TD20-01: validar instanceName para prevenir path injection
    const instanceNameRegex = /^[a-zA-Z0-9_-]{1,100}$/
    if (!instanceNameRegex.test(instanceName)) {
      this.logger.error(`Nome de instância inválido (caracteres não permitidos): ${instanceName}`)
      throw new Error('Nome de instância inválido')
    }

    const url = `${env.EVOLUTION_API_URL}/message/sendText/${instanceName}`

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
      // SEC-TD20-03: mascarar telefone nos logs (LGPD) — mostrar apenas últimos 4 dígitos
      const maskedPhone = phone.length > 4 ? `****${phone.slice(-4)}` : '****'
      this.logger.error(
        `Falha ao enviar mensagem WhatsApp para ${maskedPhone}: HTTP ${response.status} — ${errorBody}`,
      )
      throw new Error(`Evolution API retornou HTTP ${response.status}`)
    }
  }
}
