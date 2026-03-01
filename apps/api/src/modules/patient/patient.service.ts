import { Inject, Injectable } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import { ListPatientsQueryDto } from './dto/list-patients.dto'

// Campos públicos retornados na listagem — cpf e portal_access_code nunca são expostos
const PUBLIC_PATIENT_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'source',
  'status',
  'created_at',
] as const

@Injectable()
export class PatientService {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  // US-4.1: Listagem paginada de pacientes com busca por nome/telefone e filtro por status
  async listPatients(tenantId: string, dto: ListPatientsQueryDto) {
    const { page, limit, search, status } = dto
    const offset = (page - 1) * limit

    // Constrói a base da query com isolamento de tenant obrigatório
    let query = this.knex('patients').where({ tenant_id: tenantId })

    // Filtros opcionais aplicados ANTES dos terminais (mutação in-place do Knex builder)
    if (search) {
      query = query.andWhere((qb) =>
        qb.whereILike('name', `%${search}%`).orWhereILike('phone', `%${search}%`),
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
}
