import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import type { UpdateProfileDto } from './dto/update-profile.dto'
import type { UpdateScheduleDto } from './dto/update-schedule.dto'
import type { UpdateBrandingDto } from './dto/update-branding.dto'
import type { UpdateAgentSettingsDto } from './dto/update-agent-settings.dto'

export interface DoctorRow {
  id: string
  tenant_id: string
  email: string
  name: string | null
  specialty: string | null
  phone: string | null
  crm: string | null
  crm_state: string | null
  working_hours: object | null
  timezone: string
  appointment_duration: number
  onboarding_completed: boolean
  status: string
}

export interface TenantRow {
  id: string
  slug: string
  name: string
  primary_color: string
  logo_url: string | null
}

export interface AgentSettingsRow {
  id: string
  tenant_id: string
  welcome_message: string | null
  personality: string | null
  faq: string | null
  enabled: boolean
  booking_mode: string
  appointment_rules: string | null
}

export interface OnboardingStatus {
  currentStep: number
  completed: boolean
  steps: {
    profile: boolean
    schedule: boolean
    branding: boolean
    agent: boolean
  }
}

// Columns to SELECT after update — excludes password_hash
const DOCTOR_COLUMNS = [
  'id',
  'tenant_id',
  'email',
  'name',
  'specialty',
  'phone',
  'crm',
  'crm_state',
  'working_hours',
  'timezone',
  'appointment_duration',
  'onboarding_completed',
  'status',
] as const

const TENANT_COLUMNS = ['id', 'slug', 'name', 'primary_color', 'logo_url'] as const

const AGENT_COLUMNS = [
  'id',
  'tenant_id',
  'welcome_message',
  'personality',
  'faq',
  'enabled',
  'booking_mode',
  'appointment_rules',
] as const

@Injectable()
export class OnboardingService {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  /**
   * GET /doctor/onboarding/status
   *
   * Determina o progresso do wizard verificando os campos obrigatórios de cada step:
   *  - Step 1 (profile):   name e crm não nulos
   *  - Step 2 (schedule):  working_hours não nulo
   *  - Step 3 (branding):  sempre completo (logo_url é opcional)
   *  - Step 4 (agent):     welcome_message em agent_settings não nulo
   *
   * currentStep = primeiro step incompleto (1-4), ou 5 se tudo completo.
   */
  async getOnboardingStatus(tenantId: string): Promise<OnboardingStatus> {
    const doctor = await this.knex<DoctorRow>('doctors')
      .where({ tenant_id: tenantId })
      .first()

    if (!doctor) {
      throw new NotFoundException('Doutor não encontrado')
    }

    const agentSettings = await this.knex<AgentSettingsRow>('agent_settings')
      .where({ tenant_id: tenantId })
      .first()

    const steps = {
      profile: Boolean(doctor.name && doctor.crm),
      schedule: doctor.working_hours !== null &&
        typeof doctor.working_hours === 'object' &&
        Object.keys(doctor.working_hours).length > 0,
      branding: true,
      agent: Boolean(agentSettings?.welcome_message),
    }

    // currentStep = primeiro step incompleto; 5 = todos completos
    let currentStep = 5
    if (!steps.profile) currentStep = 1
    else if (!steps.schedule) currentStep = 2
    else if (!steps.branding) currentStep = 3
    else if (!steps.agent) currentStep = 4

    const completed = currentStep === 5

    return { currentStep, completed, steps }
  }

  /**
   * PATCH /doctor/onboarding/profile
   *
   * Atualiza name, specialty, phone, crm e crm_state na tabela doctors
   * usando o tenant_id como chave de isolamento (não o id do doutor).
   */
  async updateProfile(tenantId: string, dto: UpdateProfileDto): Promise<DoctorRow> {
    const rows = await this.knex('doctors')
      .where({ tenant_id: tenantId })
      .update({
        name: dto.name,
        specialty: dto.specialty ?? null,
        phone: dto.phone ?? null,
        crm: dto.crm,
        crm_state: dto.crmState,
        updated_at: this.knex.fn.now(),
      })
      .returning(DOCTOR_COLUMNS)

    const updated = rows[0] as DoctorRow | undefined

    if (!updated) {
      throw new NotFoundException('Doutor não encontrado')
    }

    return updated
  }

  /**
   * PATCH /doctor/onboarding/schedule
   *
   * Atualiza working_hours (JSONB), timezone e appointment_duration na tabela doctors.
   */
  async updateSchedule(tenantId: string, dto: UpdateScheduleDto): Promise<DoctorRow> {
    const updateData: Record<string, unknown> = {
      working_hours: JSON.stringify(dto.workingHours),
      updated_at: this.knex.fn.now(),
    }

    if (dto.timezone !== undefined) {
      updateData.timezone = dto.timezone
    }

    if (dto.appointmentDuration !== undefined) {
      updateData.appointment_duration = dto.appointmentDuration
    }

    const rows = await this.knex('doctors')
      .where({ tenant_id: tenantId })
      .update(updateData)
      .returning(DOCTOR_COLUMNS)

    const updated = rows[0] as DoctorRow | undefined

    if (!updated) {
      throw new NotFoundException('Doutor não encontrado')
    }

    return updated
  }

  /**
   * PATCH /doctor/onboarding/branding
   *
   * Atualiza primary_color e logo_url na tabela tenants (não doctors).
   */
  async updateBranding(tenantId: string, dto: UpdateBrandingDto): Promise<Pick<TenantRow, 'id' | 'slug' | 'name' | 'primary_color' | 'logo_url'>> {
    const updateData: Record<string, unknown> = {
      updated_at: this.knex.fn.now(),
    }

    if (dto.primaryColor !== undefined) {
      updateData.primary_color = dto.primaryColor
    }

    if (dto.logoUrl !== undefined) {
      updateData.logo_url = dto.logoUrl
    }

    const rows = await this.knex('tenants')
      .where({ id: tenantId })
      .update(updateData)
      .returning(TENANT_COLUMNS)

    const updated = rows[0] as Pick<TenantRow, 'id' | 'slug' | 'name' | 'primary_color' | 'logo_url'> | undefined

    if (!updated) {
      throw new NotFoundException('Tenant não encontrado')
    }

    return updated
  }

  /**
   * PATCH /doctor/onboarding/agent
   *
   * Upsert em agent_settings usando tenant_id como chave.
   * Se não existir, cria com enabled: false e booking_mode: 'off'.
   */
  async updateAgentSettings(tenantId: string, dto: UpdateAgentSettingsDto): Promise<AgentSettingsRow> {
    const existing = await this.knex<AgentSettingsRow>('agent_settings')
      .where({ tenant_id: tenantId })
      .first()

    if (existing) {
      const updateData: Record<string, unknown> = {
        welcome_message: dto.welcomeMessage,
        updated_at: this.knex.fn.now(),
      }

      if (dto.personality !== undefined) {
        updateData.personality = dto.personality
      }

      if (dto.faq !== undefined) {
        updateData.faq = dto.faq
      }

      const rows = await this.knex('agent_settings')
        .where({ tenant_id: tenantId })
        .update(updateData)
        .returning(AGENT_COLUMNS)

      return rows[0] as AgentSettingsRow
    }

    // Cria novo registro com defaults seguros.
    // booking_mode: 'both' — valor padrão válido do CHECK constraint (link | chat | both).
    // O agente inicia desabilitado (enabled: false) e com modo mais permissivo até o doutor configurar.
    const rows = await this.knex('agent_settings')
      .insert({
        tenant_id: tenantId,
        welcome_message: dto.welcomeMessage,
        personality: dto.personality ?? null,
        faq: dto.faq ?? null,
        enabled: false,
        booking_mode: 'both',
      })
      .returning(AGENT_COLUMNS)

    return rows[0] as AgentSettingsRow
  }

  /**
   * POST /doctor/onboarding/complete
   *
   * Valida que os steps obrigatórios (profile e schedule) foram preenchidos.
   * Marca onboarding_completed = true no registro do doutor.
   */
  async completeOnboarding(tenantId: string): Promise<{ success: true; doctor: { id: string; name: string; email: string; tenantId: string } }> {
    const doctor = await this.knex<DoctorRow>('doctors')
      .where({ tenant_id: tenantId })
      .first()

    if (!doctor) {
      throw new NotFoundException('Doutor não encontrado')
    }

    if (!doctor.name || !doctor.crm) {
      throw new BadRequestException('Perfil incompleto — preencha nome e CRM antes de concluir o onboarding')
    }

    const hasSchedule = doctor.working_hours !== null &&
      typeof doctor.working_hours === 'object' &&
      Object.keys(doctor.working_hours).length > 0

    if (!hasSchedule) {
      throw new BadRequestException('Horários não configurados — configure sua agenda antes de concluir o onboarding')
    }

    await this.knex('doctors')
      .where({ tenant_id: tenantId })
      .update({ onboarding_completed: true, updated_at: this.knex.fn.now() })

    return {
      success: true,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        tenantId: doctor.tenant_id,
      },
    }
  }
}
