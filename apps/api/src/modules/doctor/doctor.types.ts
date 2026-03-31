/**
 * Tipos compartilhados entre os serviços do módulo doctor/.
 * Centraliza as interfaces de row do banco para evitar duplicação.
 */

export interface AgentSettingsRow {
  id: string
  tenant_id: string
  enabled: boolean
  booking_mode: string
  welcome_message: string | null
  personality: string | null
  faq: string | null
  appointment_rules: string | null
  evolution_instance_name: string | null
  created_at: string | Date
  updated_at: string | Date
}
