import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import { CreateDocumentDto } from './dto/create-document.dto'
import { ListDocumentsDto } from './dto/list-documents.dto'

// Campos retornados em queries de documentos
// Exclui tenant_id (interno), updated_at (não relevante para o response) e file_size_bytes/mime_type (internos)
// Exportado para reutilização em patient.service e listagem de documentos (US-6.4)
export const DOCUMENT_FIELDS = [
  'id',
  'patient_id',
  'appointment_id',
  'type',
  'file_url',
  'file_name',
  'description',
  'created_at',
] as const

@Injectable()
export class DocumentService {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  // US-6.3: Registro de documento vinculado a paciente do tenant com audit trail
  async createDocument(tenantId: string, actorId: string, dto: CreateDocumentDto) {
    const { patientId, appointmentId, type, fileUrl, fileName, description } = dto

    return this.knex.transaction(async (trx) => {
      // 1. Verificar se o paciente existe e pertence ao tenant — isolamento obrigatório
      const patient = await trx('patients')
        .where({ id: patientId, tenant_id: tenantId })
        .select('id')
        .first()

      if (!patient) {
        throw new NotFoundException('Paciente não encontrado')
      }

      // 2. Inserir o documento
      const [document] = await trx('documents')
        .insert({
          tenant_id: tenantId,
          patient_id: patientId,
          appointment_id: appointmentId ?? null,
          type,
          file_url: fileUrl,
          file_name: fileName,
          description: description ?? null,
        })
        .returning([...DOCUMENT_FIELDS])

      // 3. Registrar evento no event_log como audit trail
      await trx('event_log').insert({
        tenant_id: tenantId,
        event_type: 'document.uploaded',
        actor_type: 'doctor',
        actor_id: actorId,
        payload: {
          documentId: document.id,
          patientId,
          type,
        },
      })

      return document
    })
  }

  // US-6.4: Listagem paginada de documentos de um paciente com filtro opcional por tipo
  async listDocuments(
    tenantId: string,
    query: ListDocumentsDto,
  ): Promise<{
    data: Record<string, unknown>[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { patientId, type, page, limit } = query

    const builder = this.knex('documents').where({ tenant_id: tenantId, patient_id: patientId })

    if (type) {
      builder.where({ type })
    }

    const countResult = await builder.clone().count('id as count').first()
    const total = Number(countResult?.count ?? 0)

    const data = await builder
      .select([...DOCUMENT_FIELDS])
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

  // SEC-10: Download autenticado de documento via JWT — isolamento de tenant obrigatório
  async getDocumentForDownload(tenantId: string, documentId: string) {
    const doc = await this.knex('documents')
      .where({ id: documentId, tenant_id: tenantId })
      .select(DOCUMENT_FIELDS)
      .first()

    if (!doc) {
      throw new NotFoundException('Documento não encontrado')
    }

    return doc
  }
}
