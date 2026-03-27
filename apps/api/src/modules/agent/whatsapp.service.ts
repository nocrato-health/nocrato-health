import { Injectable, Logger } from '@nestjs/common'
import { env } from '@/config/env'

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)

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
