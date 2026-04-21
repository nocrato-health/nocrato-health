import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import { env } from '@/config/env'
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto'
import { ListClinicalNotesDto } from './dto/list-clinical-notes.dto'

// Campos base retornados em queries de notas clínicas (sem content — requer decrypt via raw)
// Exclui tenant_id (interno) e updated_at (não relevante para o response)
// Exportado para reutilização em appointment.service e patient.service (sem alias de tabela)
const CLINICAL_NOTE_BASE_FIELDS = [
  'id',
  'appointment_id',
  'patient_id',
  'created_at',
] as const

/**
 * Retorna o array de campos para SELECT de notas clínicas, incluindo o decrypt de content.
 * Deve ser usado em todo SELECT que precise do campo content.
 * Recebe a instância knex (ou trx) para construir o raw com a chave de criptografia.
 */
export function getClinicalNoteSelectFields(knex: Knex): (string | Knex.Raw)[] {
  return [
    ...CLINICAL_NOTE_BASE_FIELDS,
    knex.raw('pgp_sym_decrypt(content, ?) as content', [env.DOCUMENT_ENCRYPTION_KEY]),
  ]
}

@Injectable()
export class ClinicalNoteService {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  // US-6.1: Criação de nota clínica vinculada a consulta e paciente do tenant
  async createClinicalNote(
    tenantId: string,
    actorId: string,
    dto: CreateClinicalNoteDto,
  ) {
    const { appointmentId, patientId, content } = dto

    return this.knex.transaction(async (trx) => {
      // 1. Verificar se a consulta existe e pertence ao tenant — isolamento obrigatório
      const appointment = await trx('appointments')
        .where({ id: appointmentId, tenant_id: tenantId })
        .select('id')
        .first()

      if (!appointment) {
        throw new NotFoundException('Consulta não encontrada')
      }

      // 2. Verificar se o paciente existe e pertence ao tenant — isolamento obrigatório
      const patient = await trx('patients')
        .where({ id: patientId, tenant_id: tenantId })
        .select('id')
        .first()

      if (!patient) {
        throw new NotFoundException('Paciente não encontrado')
      }

      // 3. Inserir a nota clínica com content criptografado via pgcrypto
      const [note] = await trx('clinical_notes')
        .insert({
          tenant_id: tenantId,
          appointment_id: appointmentId,
          patient_id: patientId,
          content: trx.raw('pgp_sym_encrypt(?, ?)', [content, env.DOCUMENT_ENCRYPTION_KEY]),
        })
        .returning([
          ...CLINICAL_NOTE_BASE_FIELDS,
          trx.raw('pgp_sym_decrypt(content, ?) as content', [env.DOCUMENT_ENCRYPTION_KEY]),
        ])

      // 4. Registrar evento no event_log como audit trail
      await trx('event_log').insert({
        tenant_id: tenantId,
        event_type: 'note.created',
        actor_type: 'doctor',
        actor_id: actorId,
        payload: {
          noteId: note.id,
          appointmentId,
          patientId,
        },
      })

      return note
    })
  }

  // US-6.2: Listagem de notas clínicas por consulta ou por paciente, com paginação
  async listClinicalNotes(tenantId: string, query: ListClinicalNotesDto) {
    const { appointmentId, patientId, page, limit } = query

    const builder = this.knex('clinical_notes').where({ tenant_id: tenantId })

    if (appointmentId) {
      builder.where({ appointment_id: appointmentId })
    } else if (patientId) {
      builder.where({ patient_id: patientId })
    }

    // Clonar antes de adicionar terminais count para não interferir na query de dados
    const countResult = await builder.clone().count('id as count').first()
    const total = Number(countResult?.count ?? 0)

    const data = await builder
      .select(getClinicalNoteSelectFields(this.knex))
      .orderBy('created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)

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
}

// Exportar constante base de campos para reutilização onde não é necessário o content
export { CLINICAL_NOTE_BASE_FIELDS }
