import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common'
import { env } from '@/config/env'
import type {
  WhatsAppConnectionProvider,
  WhatsAppConnectionResult,
  WhatsAppConnectionStatus,
  WhatsAppQrCodeResult,
} from './whatsapp-connection.provider'

const INSTANCE_NAME_REGEX = /^[a-zA-Z0-9_-]{1,100}$/

@Injectable()
export class EvolutionConnectionProvider implements WhatsAppConnectionProvider {
  private readonly logger = new Logger(EvolutionConnectionProvider.name)

  private validateInstanceName(instanceName: string): void {
    if (!INSTANCE_NAME_REGEX.test(instanceName)) {
      throw new BadRequestException('Nome de instância inválido')
    }
  }

  async createInstance(instanceName: string, webhookUrl: string): Promise<WhatsAppConnectionResult> {
    this.validateInstanceName(instanceName)

    const url = `${env.EVOLUTION_API_URL}/instance/create`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        instanceName,
        webhook: webhookUrl,
        webhookByEvents: true,
        webhookEvents: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        token: env.EVOLUTION_WEBHOOK_TOKEN,
      }),
    })

    if (response.status === 409) {
      this.logger.log(`Instância já existe: ${instanceName}`)
      return { instanceName, status: 'already_exists' }
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '(corpo indisponível)')
      this.logger.error(`Falha ao criar instância ${instanceName}: HTTP ${response.status} — ${body}`)
      throw new InternalServerErrorException('Falha ao criar instância WhatsApp')
    }

    this.logger.log(`Instância criada: ${instanceName}`)
    return { instanceName, status: 'created' }
  }

  async getQrCode(instanceName: string): Promise<WhatsAppQrCodeResult> {
    this.validateInstanceName(instanceName)

    const url = `${env.EVOLUTION_API_URL}/instance/connect/${instanceName}`
    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: env.EVOLUTION_API_KEY },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '(corpo indisponível)')
      this.logger.error(`Falha ao obter QR code da instância ${instanceName}: HTTP ${response.status} — ${body}`)
      throw new InternalServerErrorException('Falha ao obter QR code')
    }

    const data = (await response.json()) as Record<string, unknown>

    // Já conectado — Evolution retorna state open sem base64
    if ((data as { instance?: { state?: string } }).instance?.state === 'open') {
      return { qrCode: '', status: 'connected' }
    }

    const base64 = (data as { base64?: string }).base64
    if (!base64) {
      return { qrCode: '', status: 'connecting' }
    }

    return { qrCode: base64, status: 'qr_ready' }
  }

  async getConnectionStatus(instanceName: string): Promise<WhatsAppConnectionStatus> {
    this.validateInstanceName(instanceName)

    const url = `${env.EVOLUTION_API_URL}/instance/connectionState/${instanceName}`
    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: env.EVOLUTION_API_KEY },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '(corpo indisponível)')
      this.logger.error(
        `Falha ao verificar status da instância ${instanceName}: HTTP ${response.status} — ${body}`,
      )
      throw new InternalServerErrorException('Falha ao verificar status WhatsApp')
    }

    const data = (await response.json()) as {
      instance?: { state?: string; profileJid?: string }
    }

    const rawState = data.instance?.state ?? ''
    const stateMap: Record<string, WhatsAppConnectionStatus['status']> = {
      open: 'open',
      close: 'close',
      connecting: 'connecting',
    }
    const status: WhatsAppConnectionStatus['status'] = stateMap[rawState] ?? 'unknown'

    // Extrair número do JID (formato: 5511999998888@s.whatsapp.net → 5511999998888)
    // Retornado inteiro ao frontend — é o número do próprio doutor, não PII de terceiro
    const rawJid = data.instance?.profileJid
    const phoneNumber = rawJid ? rawJid.split('@')[0] : undefined

    return { instanceName, status, phoneNumber }
  }

  async disconnectInstance(instanceName: string): Promise<void> {
    this.validateInstanceName(instanceName)

    const url = `${env.EVOLUTION_API_URL}/instance/logout/${instanceName}`
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { apikey: env.EVOLUTION_API_KEY },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '(corpo indisponível)')
      this.logger.error(
        `Falha ao desconectar instância ${instanceName}: HTTP ${response.status} — ${body}`,
      )
      throw new InternalServerErrorException('Falha ao desconectar instância WhatsApp')
    }

    this.logger.log(`Instância desconectada: ${instanceName}`)
  }

  async deleteInstance(instanceName: string): Promise<void> {
    this.validateInstanceName(instanceName)

    const url = `${env.EVOLUTION_API_URL}/instance/delete/${instanceName}`
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { apikey: env.EVOLUTION_API_KEY },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '(corpo indisponível)')
      this.logger.error(
        `Falha ao remover instância ${instanceName}: HTTP ${response.status} — ${body}`,
      )
      throw new InternalServerErrorException('Falha ao remover instância WhatsApp')
    }

    this.logger.log(`Instância removida: ${instanceName}`)
  }
}
