import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import type { AgentSettingsResponseDto } from './dto/agent-settings-response.dto'
import type { UpdateAgentSettingsV2Dto } from './dto/update-agent-settings-v2.dto'

interface AgentSettingsRow {
  id: string
  tenant_id: string
  enabled: boolean
  booking_mode: string
  welcome_message: string | null
  personality: string | null
  faq: string | null
  appointment_rules: string | null
  created_at: string | Date
  updated_at: string | Date
}

const AGENT_SETTINGS_FIELDS = [
  'id',
  'tenant_id',
  'enabled',
  'booking_mode',
  'welcome_message',
  'personality',
  'faq',
  'appointment_rules',
  'created_at',
  'updated_at',
] as const

function mapRow(row: AgentSettingsRow): AgentSettingsResponseDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    enabled: row.enabled,
    bookingMode: row.booking_mode as 'link' | 'chat' | 'both',
    welcomeMessage: row.welcome_message,
    personality: row.personality,
    faq: row.faq,
    appointmentRules: row.appointment_rules,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

@Injectable()
export class AgentSettingsService {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  /**
   * GET /api/v1/doctor/agent-settings
   *
   * Retorna as configurações do agente WhatsApp do doutor autenticado.
   * Isolamento por tenant_id extraído do JWT.
   */
  async getAgentSettings(tenantId: string): Promise<AgentSettingsResponseDto> {
    const row = await this.knex<AgentSettingsRow>('agent_settings')
      .select([...AGENT_SETTINGS_FIELDS])
      .where({ tenant_id: tenantId })
      .first()

    if (!row) {
      throw new NotFoundException('Configurações do agente não encontradas')
    }

    return mapRow(row)
  }

  /**
   * PATCH /api/v1/doctor/agent-settings
   *
   * Atualiza parcialmente as configurações do agente WhatsApp.
   * Apenas os campos presentes no dto são atualizados (patch real).
   * Isolamento por tenant_id extraído do JWT.
   */
  async updateAgentSettings(
    tenantId: string,
    dto: UpdateAgentSettingsV2Dto,
  ): Promise<AgentSettingsResponseDto> {
    // Verifica existência antes de atualizar — garante isolamento cross-tenant
    const existing = await this.knex('agent_settings')
      .where({ tenant_id: tenantId })
      .select('id')
      .first()

    if (!existing) {
      throw new NotFoundException('Configurações do agente não encontradas')
    }

    // Patch parcial: apenas campos explicitamente definidos no dto
    const updateData: Record<string, unknown> = {
      updated_at: this.knex.fn.now(),
    }

    if (dto.enabled !== undefined) {
      updateData.enabled = dto.enabled
    }

    if (dto.bookingMode !== undefined) {
      updateData.booking_mode = dto.bookingMode
    }

    if (dto.welcomeMessage !== undefined) {
      updateData.welcome_message = dto.welcomeMessage
    }

    if (dto.personality !== undefined) {
      updateData.personality = dto.personality
    }

    if (dto.faq !== undefined) {
      updateData.faq = dto.faq
    }

    if (dto.appointmentRules !== undefined) {
      updateData.appointment_rules = dto.appointmentRules
    }

    // SEC-TD20-02: tratar erro 23505 (unique violation) para evolution_instance_name
    try {
      const rows = await this.knex('agent_settings')
        .where({ tenant_id: tenantId })
        .update(updateData)
        .returning([...AGENT_SETTINGS_FIELDS])

      const updated = rows[0] as AgentSettingsRow | undefined

      if (!updated) {
        throw new NotFoundException('Configurações do agente não encontradas')
      }

      return mapRow(updated)
    } catch (err: unknown) {
      // Tratar erro de unique constraint violation para evolution_instance_name
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        throw new ConflictException('Nome de instância já está em uso por outro consultório')
      }
      throw err
    }
  }
}
