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
export const CLOUD_API_CONNECTION_PROVIDER = Symbol('CLOUD_API_CONNECTION_PROVIDER')

export interface WhatsAppConnectionProvider {
  createInstance(instanceName: string, webhookUrl: string): Promise<WhatsAppConnectionResult>
  getQrCode(instanceName: string): Promise<WhatsAppQrCodeResult>
  getConnectionStatus(instanceName: string): Promise<WhatsAppConnectionStatus>
  disconnectInstance(instanceName: string): Promise<void>
  deleteInstance(instanceName: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Interface específica para provedores baseados em Embedded Signup (Cloud API)
// ---------------------------------------------------------------------------

export interface SignupCodeResult {
  phoneNumberId: string
  wabaId: string
  displayPhoneNumber: string
  verifiedName: string
}

/**
 * Provedores que usam o fluxo OAuth da Meta (Embedded Signup) em vez de
 * conexão via QR code implementam esta interface adicionalmente a
 * WhatsAppConnectionProvider.
 */
export interface SignupBasedConnectionProvider {
  exchangeSignupCode(code: string): Promise<SignupCodeResult>
}
