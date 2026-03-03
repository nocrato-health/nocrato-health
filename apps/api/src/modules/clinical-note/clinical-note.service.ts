import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto'
import { ListClinicalNotesDto } from './dto/list-clinical-notes.dto'

// Campos retornados em queries de notas clínicas
// Exclui tenant_id (interno) e updated_at (não relevante para o response)
// Exportado para reutilização em appointment.service e patient.service (sem alias de tabela)
const CLINICAL_NOTE_FIELDS = [
  'id',
  'appointment_id',
  'patient_id',
  'content',
  'created_at',
] as const

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

      // 3. Inserir a nota clínica
      const [note] = await trx('clinical_notes')
        .insert({
          tenant_id: tenantId,
          appointment_id: appointmentId,
          patient_id: patientId,
          content,
        })
        .returning([...CLINICAL_NOTE_FIELDS])

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
      .select([...CLINICAL_NOTE_FIELDS])
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

// Exportar constante de campos para reutilização (ex: appointment detail)
export { CLINICAL_NOTE_FIELDS }
