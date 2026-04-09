import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Knex } from 'knex'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { KNEX } from '@/database/knex.provider'
import { env } from '@/config/env'
import { EventLogService } from '@/modules/event-log/event-log.service'
import { ListPatientsQueryDto } from './dto/list-patients.dto'
import { CreatePatientDto } from './dto/create-patient.dto'
import { UpdatePatientDto } from './dto/update-patient.dto'

// Tipo retornado em findByPhone e na listagem (campos públicos sem dados sensíveis)
export interface PatientPublicRow {
  id: string
  name: string
  phone: string
  email: string | null
  source: string
  status: string
  created_at: Date | string
}

// Campos públicos retornados na listagem — document e portal_access_code nunca são expostos
// document_type é metadado não sensível (indica se o paciente tem CPF ou RG)
const PUBLIC_PATIENT_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'source',
  'status',
  'document_type',
  'created_at',
] as const

// Campos do perfil completo do paciente — inclui portal_active, exclui document e portal_access_code
// document_type é metadado não sensível, pode aparecer no perfil
const PATIENT_PROFILE_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'source',
  'status',
  'portal_active',
  'document_type',
  'created_at',
] as const

const APPOINTMENT_FIELDS = [
  'id',
  'date_time',
  'status',
  'duration_minutes',
  'started_at',
  'completed_at',
] as const

const CLINICAL_NOTE_FIELDS = [
  'id',
  'appointment_id',
  'content',
  'created_at',
] as const

const DOCUMENT_FIELDS = [
  'id',
  'file_name',
  'type',
  'file_url',
  'mime_type',
  'created_at',
] as const

// Normaliza documento para apenas dígitos antes do encrypt
function normalizeDocumentDigits(value: string): string {
  return value.replace(/\D/g, '')
}

// Valida formato do documento conforme o tipo
function validateDocumentFormat(normalized: string, documentType: 'cpf' | 'rg'): void {
  if (documentType === 'cpf') {
    if (normalized.length !== 11) {
      throw new BadRequestException('CPF deve ter 11 dígitos')
    }
  } else {
    // RG: 7 a 14 dígitos (varia por estado)
    if (normalized.length < 7 || normalized.length > 14) {
      throw new BadRequestException('RG deve ter entre 7 e 14 dígitos')
    }
  }
}

@Injectable()
export class PatientService {
  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventLogService: EventLogService,
  ) {}

  // US-4.1: Listagem paginada de pacientes com busca por nome/telefone e filtro por status
  async listPatients(tenantId: string, dto: ListPatientsQueryDto) {
    const { page, limit, search, status } = dto
    const offset = (page - 1) * limit

    // Constrói a base da query com isolamento de tenant obrigatório
    let query = this.knex('patients').where({ tenant_id: tenantId })

    // Filtros opcionais aplicados ANTES dos terminais (mutação in-place do Knex builder)
    if (search) {
      const escaped = search.replaceAll(/[%_\\]/g, String.raw`\$&`)
      query = query.andWhere((qb) =>
        qb.whereILike('name', `%${escaped}%`).orWhereILike('phone', `%${escaped}%`),
      )
    }

    if (status) {
      query = query.andWhere({ status })
    }

    // Executa count e data em paralelo para eficiência
    const [countResult, data] = await Promise.all([
      query.clone().count('id as count').first(),
      query
        .clone()
        .select(PUBLIC_PATIENT_FIELDS)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
    ])

    // Knex.count() retorna string do PostgreSQL — converter com Number()
    const total = Number(countResult?.count ?? 0)

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // US-4.2: Perfil completo do paciente com appointments, notas clínicas e documentos
  async getPatientProfile(tenantId: string, patientId: string) {
    // Busca o paciente com isolamento de tenant obrigatório
    const patient = await this.knex('patients')
      .where({ id: patientId, tenant_id: tenantId })
      .select(PATIENT_PROFILE_FIELDS)
      .first()

    // Se não encontrado ou pertence a outro tenant: 404 (não vazar existência)
    if (!patient) {
      throw new NotFoundException('Paciente não encontrado')
    }

    // Executa as 3 queries paralelas — todas scoped por tenant_id e patient_id
    const [appointments, clinicalNotes, documents] = await Promise.all([
      this.knex('appointments')
        .where({ tenant_id: tenantId, patient_id: patientId })
        .select(APPOINTMENT_FIELDS)
        .orderBy('date_time', 'desc'),
      this.knex('clinical_notes')
        .where({ tenant_id: tenantId, patient_id: patientId })
        .select(CLINICAL_NOTE_FIELDS)
        .orderBy('created_at', 'desc'),
      this.knex('documents')
        .where({ tenant_id: tenantId, patient_id: patientId })
        .select(DOCUMENT_FIELDS)
        .orderBy('created_at', 'desc'),
    ])

    return {
      patient,
      appointments,
      clinicalNotes,
      documents,
    }
  }

  // Retorna o documento descriptografado do paciente (endpoint separado — dado sensível)
  async getDoctorPatientDocument(
    tenantId: string,
    patientId: string,
  ): Promise<{ document_type: 'cpf' | 'rg'; document: string } | null> {
    const result = await this.knex
      .select([
        'document_type',
        this.knex.raw(`pgp_sym_decrypt(document, ?) AS document`, [env.DOCUMENT_ENCRYPTION_KEY]),
      ])
      .from('patients')
      .where({ id: patientId, tenant_id: tenantId })
      .first()

    // Paciente não encontrado (ou pertence a outro tenant — isolamento)
    if (result === undefined || result === null) {
      throw new NotFoundException('Paciente não encontrado')
    }

    // Paciente sem documento cadastrado
    if (result.document_type === null || result.document_type === undefined) {
      return null
    }

    return {
      document_type: result.document_type as 'cpf' | 'rg',
      document: result.document as string,
    }
  }

  // US-4.4: Edição parcial de paciente pelo doutor
  async updatePatient(tenantId: string, patientId: string, dto: UpdatePatientDto) {
    // 1. Verificar se o paciente existe neste tenant — nunca vazar existência de outros tenants
    const existing = await this.knex('patients')
      .where({ id: patientId, tenant_id: tenantId })
      .select('id')
      .first()

    if (!existing) {
      throw new NotFoundException('Paciente não encontrado')
    }

    // 2. Construir objeto de update com apenas os campos presentes no dto (patch parcial real)
    const updateData: Record<string, unknown> = {}
    if (dto.name !== undefined) updateData.name = dto.name
    if (dto.phone !== undefined) updateData.phone = dto.phone
    if (dto.email !== undefined) updateData.email = dto.email
    if (dto.status !== undefined) updateData.status = dto.status

    // Documento: normalizar, validar formato, encriptar (ambos presentes ou nenhum — garantido pelo DTO)
    if (dto.document !== undefined && dto.documentType !== undefined) {
      const normalized = normalizeDocumentDigits(dto.document)
      validateDocumentFormat(normalized, dto.documentType)
      updateData.document = this.knex.raw('pgp_sym_encrypt(?, ?)', [normalized, env.DOCUMENT_ENCRYPTION_KEY])
      updateData.document_type = dto.documentType
    }

    updateData.updated_at = this.knex.fn.now()

    try {
      // 3. Executar update com isolamento de tenant e retornar campos públicos
      const [updated] = await this.knex('patients')
        .where({ id: patientId, tenant_id: tenantId })
        .update(updateData)
        .returning(PUBLIC_PATIENT_FIELDS)

      return updated
    } catch (error: unknown) {
      // Código PostgreSQL 23505 = unique_violation (telefone já cadastrado para este tenant)
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        throw new ConflictException('Telefone já cadastrado para outro paciente')
      }
      throw error
    }
  }

  // US-4.3: Criação manual de paciente pelo doutor
  async createPatient(tenantId: string, dto: CreatePatientDto) {
    const { name, phone, document, documentType, email, dateOfBirth } = dto

    // Preparar dados do documento se fornecidos
    let documentValue: ReturnType<Knex['raw']> | null = null
    let documentTypeValue: string | null = null

    if (document !== undefined && documentType !== undefined) {
      const normalized = normalizeDocumentDigits(document)
      validateDocumentFormat(normalized, documentType)
      documentValue = this.knex.raw('pgp_sym_encrypt(?, ?)', [normalized, env.DOCUMENT_ENCRYPTION_KEY])
      documentTypeValue = documentType
    }

    try {
      const [patient] = await this.knex('patients')
        .insert({
          tenant_id: tenantId,
          name,
          phone,
          document: documentValue,
          document_type: documentTypeValue,
          email: email ?? null,
          date_of_birth: dateOfBirth ?? null,
          source: 'manual',
          status: 'active',
        })
        .returning(PUBLIC_PATIENT_FIELDS)

      return patient
    } catch (error: unknown) {
      // Código PostgreSQL 23505 = unique_violation (telefone já cadastrado para este tenant)
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        throw new ConflictException('Telefone já cadastrado para outro paciente')
      }
      throw error
    }
  }

  // US-9.3: Busca paciente pelo telefone — retorna null se não encontrado (sem exceção)
  async findByPhone(
    tenantId: string,
    phone: string,
  ): Promise<PatientPublicRow | null> {
    const patient = await this.knex('patients')
      .where({ tenant_id: tenantId, phone })
      .select(PUBLIC_PATIENT_FIELDS)
      .first()

    return (patient as PatientPublicRow | undefined) ?? null
  }

  // US-10.2: Retorna os dados do portal do paciente autenticado via código de acesso
  async getPatientPortalData(code: string) {
    // 1. Buscar paciente pelo código de acesso junto com dados do tenant e do doutor
    const row = await this.knex('patients')
      .join('tenants', 'patients.tenant_id', 'tenants.id')
      .join('doctors', 'doctors.tenant_id', 'tenants.id')
      .where('patients.portal_access_code', code)
      .select([
        'patients.id',
        'patients.name',
        'patients.phone',
        'patients.email',
        'patients.date_of_birth',
        'patients.portal_active',
        'patients.status',
        'patients.tenant_id',
        'tenants.name as tenant_name',
        'tenants.status as tenant_status',
        'tenants.slug',
        'tenants.primary_color',
        'tenants.logo_url',
        'doctors.name as doctor_name',
        'doctors.specialty as doctor_specialty',
        'doctors.timezone as doctor_timezone',
      ])
      .first()

    if (!row) {
      throw new NotFoundException('Código de acesso inválido')
    }

    // 2. Validar status do portal, do paciente e do tenant
    if (!row.portal_active) {
      throw new ForbiddenException('Portal inativo')
    }

    if (row.status !== 'active') {
      throw new ForbiddenException('Paciente inativo')
    }

    if (row.tenant_status !== 'active') {
      throw new ForbiddenException('Clínica inativa')
    }

    const { tenant_id: tenantId, id: patientId } = row

    // 3. Registrar acesso ao portal no event_log (auditoria LGPD — TD-23)
    await this.eventLogService.append(tenantId, 'patient.portal_accessed', 'patient', patientId, {})

    // 4. Buscar appointments e documentos em paralelo — clinical_notes NUNCA são expostas ao paciente
    const [appointments, documents] = await Promise.all([
      this.knex('appointments')
        .where({ tenant_id: tenantId, patient_id: patientId })
        .select(['id', 'date_time', 'status', 'duration_minutes', 'started_at', 'completed_at', 'cancellation_reason'])
        .orderBy('date_time', 'desc'),
      this.knex('documents')
        .where({ tenant_id: tenantId, patient_id: patientId })
        .select(['id', 'type', 'file_url', 'file_name', 'description', 'created_at'])
        .orderBy('created_at', 'desc'),
    ])

    return {
      patient: {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        date_of_birth: row.date_of_birth,
        portal_active: row.portal_active,
        status: row.status,
      },
      doctor: {
        name: row.doctor_name,
        specialty: row.doctor_specialty,
        timezone: row.doctor_timezone,
      },
      tenant: {
        name: row.tenant_name,
        slug: row.slug,
        primary_color: row.primary_color,
        logo_url: row.logo_url,
        status: row.tenant_status,
      },
      appointments,
      documents,
    }
  }

  // US-10.2: Retorna um documento do paciente autenticado via código de acesso (para download)
  async getPatientDocument(code: string, documentId: string) {
    // 1. Validar o código de acesso e checar status do portal/paciente/tenant
    const row = await this.knex('patients')
      .join('tenants', 'patients.tenant_id', 'tenants.id')
      .where('patients.portal_access_code', code)
      .select([
        'patients.id',
        'patients.portal_active',
        'patients.status',
        'patients.tenant_id',
        'tenants.status as tenant_status',
      ])
      .first()

    if (!row) {
      throw new NotFoundException('Código de acesso inválido')
    }

    if (!row.portal_active) {
      throw new ForbiddenException('Portal inativo')
    }

    if (row.status !== 'active') {
      throw new ForbiddenException('Paciente inativo')
    }

    if (row.tenant_status !== 'active') {
      throw new ForbiddenException('Clínica inativa')
    }

    // 2. Buscar o documento com isolamento por patient_id e tenant_id
    const document = await this.knex('documents')
      .where({
        id: documentId,
        patient_id: row.id,
        tenant_id: row.tenant_id,
      })
      .select(['id', 'type', 'file_url', 'file_name', 'description', 'created_at'])
      .first()

    if (!document) {
      throw new NotFoundException('Documento não encontrado')
    }

    return document
  }

  // US-9.1: Ativa o portal do paciente e emite evento para notificação WhatsApp
  async activatePortal(tenantId: string, patientId: string): Promise<void> {
    // 1. Buscar o paciente com isolamento de tenant obrigatório
    const patient = await this.knex('patients')
      .where({ id: patientId, tenant_id: tenantId })
      .select(['id', 'phone', 'portal_active', 'portal_access_code'])
      .first()

    if (!patient) {
      throw new NotFoundException('Paciente não encontrado')
    }

    // 2. Se já está ativo — idempotente, não emitir evento de duplicidade
    if (patient.portal_active) {
      return
    }

    // 3. Ativar portal
    await this.knex('patients')
      .where({ id: patientId, tenant_id: tenantId })
      .update({ portal_active: true })

    // 4. Registrar no event_log via EventLogService
    // LGPD SEC-11: payload sem PII — telefone pode ser recuperado via patients join.
    await this.eventLogService.append(
      tenantId,
      'patient.portal_activated',
      'system',
      null,
      { patientId },
    )

    // 5. Emitir evento via EventEmitter2 (fire-and-forget)
    this.eventEmitter.emit('patient.portal_activated', {
      tenantId,
      patientId,
      phone: patient.phone as string,
      portalAccessCode: patient.portal_access_code as string | null,
    })
  }
}
