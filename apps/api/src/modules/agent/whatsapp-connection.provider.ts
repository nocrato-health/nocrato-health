export interface WhatsAppConnectionResult {
  instanceName: string
  status: 'created' | 'already_exists'
}

export interface WhatsAppQrCodeResult {
  qrCode: string // base64 do QR code
  status: 'qr_ready' | 'connected' | 'connecting'
}

export interface WhatsAppConnectionStatus {
  instanceName: string
  status: 'open' | 'close' | 'connecting' | 'unknown'
  phoneNumber?: string
}

export const WHATSAPP_CONNECTION_PROVIDER = Symbol('WHATSAPP_CONNECTION_PROVIDER')

export interface WhatsAppConnectionProvider {
  createInstance(instanceName: string, webhookUrl: string): Promise<WhatsAppConnectionResult>
  getQrCode(instanceName: string): Promise<WhatsAppQrCodeResult>
  getConnectionStatus(instanceName: string): Promise<WhatsAppConnectionStatus>
  disconnectInstance(instanceName: string): Promise<void>
  deleteInstance(instanceName: string): Promise<void>
}
