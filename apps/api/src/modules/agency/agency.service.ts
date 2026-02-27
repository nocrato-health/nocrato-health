import { Inject, Injectable } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'

export interface DashboardStats {
  totalDoctors: number
  activeDoctors: number
  totalPatients: number
  totalAppointments: number
  upcomingAppointments: number
}

@Injectable()
export class AgencyService {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  // US-2.2: Listagem paginada de doutores com JOIN em tenants para o slug
  async listDoctors(page: number, limit: number, status?: 'active' | 'inactive') {
    const offset = (page - 1) * limit

    // Constrói a base da query de dados (sem os terminais limit/offset ainda)
    const baseQuery = this.knex('doctors as d')
      .join('tenants as t', 'd.tenant_id', 't.id')
      .select(
        'd.id',
        'd.name',
        'd.email',
        't.slug',
        'd.crm',
        'd.specialty',
        'd.status',
        'd.created_at as createdAt',
      )
      .orderBy('d.created_at', 'desc')

    // Constrói a base da query de contagem (sem o terminal count ainda)
    const baseCountQuery = this.knex('doctors as d')

    // Aplica o filtro opcional ANTES dos terminais
    if (status) {
      baseQuery.where('d.status', status)
      baseCountQuery.where('d.status', status)
    }

    // Adiciona os terminais após o filtro opcional
    const dataQuery = baseQuery.limit(limit).offset(offset)
    const countQuery = baseCountQuery.count('d.id as count')

    const [rows, [countRow]] = await Promise.all([dataQuery, countQuery])

    const total = Number(countRow.count)
    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // US-2.1: Estatísticas globais da agência para o dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    const [totalDoctorsRow] = await this.knex('doctors').count('id as count')
    const [activeDoctorsRow] = await this.knex('doctors')
      .where({ status: 'active' })
      .count('id as count')
    const [totalPatientsRow] = await this.knex('patients').count('id as count')
    const [totalAppointmentsRow] = await this.knex('appointments').count('id as count')
    const [upcomingAppointmentsRow] = await this.knex('appointments')
      .where('date_time', '>', this.knex.fn.now())
      .whereIn('status', ['scheduled', 'waiting'])
      .count('id as count')

    return {
      totalDoctors: Number(totalDoctorsRow.count),
      activeDoctors: Number(activeDoctorsRow.count),
      totalPatients: Number(totalPatientsRow.count),
      totalAppointments: Number(totalAppointmentsRow.count),
      upcomingAppointments: Number(upcomingAppointmentsRow.count),
    }
  }
}
