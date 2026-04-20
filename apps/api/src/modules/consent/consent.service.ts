import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name)

  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  /**
   * Registra consentimento do paciente (LGPD Art. 7º).
   * Append-only — cada aceite gera um novo registro (nunca update).
   */
  async registerConsent(params: {
    tenantId: string
    patientId: string
    consentType: 'privacy_policy' | 'data_processing'
    consentVersion?: string
    source: 'booking' | 'patient_portal' | 'whatsapp_agent'
    ipAddress?: string | null
    userAgent?: string | null
  }): Promise<void> {
    await this.knex('patient_consents').insert({
      tenant_id: params.tenantId,
      patient_id: params.patientId,
      consent_type: params.consentType,
      consent_version: params.consentVersion ?? '1.0',
      source: params.source,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    })

    this.logger.log(
      `Consentimento '${params.consentType}' v${params.consentVersion ?? '1.0'} registrado para paciente ${params.patientId} (source: ${params.source})`,
    )
  }

  /**
   * Verifica se o paciente já aceitou um determinado tipo de consentimento (na versão atual).
   */
  async hasConsent(
    tenantId: string,
    patientId: string,
    consentType: string,
    consentVersion: string = '1.0',
  ): Promise<boolean> {
    const result = await this.knex('patient_consents')
      .where({
        tenant_id: tenantId,
        patient_id: patientId,
        consent_type: consentType,
        consent_version: consentVersion,
      })
      .count('id as count')
      .first()

    return Number(result?.count ?? 0) > 0
  }

  /**
   * Lista consentimentos de um paciente (para auditoria no portal do doutor).
   */
  async listConsents(
    tenantId: string,
    patientId: string,
  ): Promise<
    Array<{
      id: string
      consent_type: string
      consent_version: string
      accepted_at: string
      source: string
    }>
  > {
    return this.knex('patient_consents')
      .where({ tenant_id: tenantId, patient_id: patientId })
      .select(['id', 'consent_type', 'consent_version', 'accepted_at', 'source'])
      .orderBy('accepted_at', 'desc')
  }
}
