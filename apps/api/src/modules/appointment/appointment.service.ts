import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { Knex } from 'knex'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { KNEX } from '@/database/knex.provider'
import { EventLogService } from '@/modules/event-log/event-log.service'
import { ListAppointmentsDto } from './dto/list-appointments.dto'
import { CreateAppointmentDto } from './dto/create-appointment.dto'
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto'

// Gera código de acesso ao portal do paciente no formato AAA-1234-BBB
// Letras sem I e O para evitar ambiguidade visual
function generatePortalAccessCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sem I, O
  const digits = '0123456789'
  const rand = (charset: string) => charset[Math.floor(Math.random() * charset.length)]
  const p1 = [rand(letters), rand(letters), rand(letters)].join('')
  const p2 = [rand(digits), rand(digits), rand(digits), rand(digits)].join('')
  const p3 = [rand(letters), rand(letters), rand(letters)].join('')
  return `${p1}-${p2}-${p3}`
}

// Campos retornados na listagem de consultas
// agent_summary é dado interno de processamento — não é necessário na listagem
const APPOINTMENT_LIST_FIELDS = [
  'id',
  'tenant_id',
  'patient_id',
  'date_time',
  'duration_minutes',
  'status',
  'cancellation_reason',
  'rescheduled_to_id',
  'created_by',
  'started_at',
  'completed_at',
  'created_at',
] as const

// Campos do paciente retornados no detalhe da consulta
// cpf e portal_access_code nunca são expostos
const APPOINTMENT_DETAIL_PATIENT_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'source',
  'status',
  'portal_active',
  'created_at',
] as const

@Injectable()
export class AppointmentService {
  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventLogService: EventLogService,
  ) {}

  // US-5.1: Listagem paginada de consultas com filtros opcionais
  async listAppointments(tenantId: string, dto: ListAppointmentsDto) {
    const { page, limit, status, date, patientId } = dto
    const offset = (page - 1) * limit

    // Constrói a base da query com isolamento de tenant obrigatório
    let query = this.knex('appointments').where({ tenant_id: tenantId })

    // Filtros opcionais aplicados ANTES dos terminais (mutação in-place do Knex builder)
    if (status) {
      query = query.andWhere({ status })
    }

    if (patientId) {
      query = query.andWhere({ patient_id: patientId })
    }

    // Filtro por data: converte YYYY-MM-DD em range [início do dia, fim do dia] UTC
    // Usa BETWEEN para capturar todas as consultas do dia independentemente do horário
    if (date) {
      const startOfDay = `${date}T00:00:00.000Z`
      const endOfDay = `${date}T23:59:59.999Z`
      query = query.andWhereBetween('date_time', [startOfDay, endOfDay])
    }

    // Executa count e data em paralelo para eficiência — clonar antes de aplicar terminais
    const [countResult, data] = await Promise.all([
      query.clone().count('id as count').first(),
      query
        .clone()
        .select(APPOINTMENT_LIST_FIELDS)
        .orderBy('date_time', 'desc')
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

  // US-5.5: Dashboard do doutor — consultas de hoje, total de pacientes ativos e follow-ups pendentes
  async getDoctorDashboard(tenantId: string) {
    // Range UTC do dia corrente para filtrar consultas de hoje
    const today = new Date()
    const datePrefix = today.toISOString().split('T')[0]
    const startOfDay = `${datePrefix}T00:00:00.000Z`
    const endOfDay = `${datePrefix}T23:59:59.999Z`

    // Executa as 3 queries em paralelo para eficiência máxima
    const [todayAppointments, totalPatientsResult, pendingFollowUpsResult] = await Promise.all([
      // 1. Consultas do dia atual, ordenadas por horário crescente
      this.knex('appointments')
        .where({ tenant_id: tenantId })
        .andWhereBetween('date_time', [startOfDay, endOfDay])
        .select(APPOINTMENT_LIST_FIELDS)
        .orderBy('date_time', 'asc'),

      // 2. Total de pacientes ativos no tenant
      this.knex('patients')
        .where({ tenant_id: tenantId, status: 'active' })
        .count('id as count')
        .first(),

      // 3. Consultas completadas sem nenhuma nota clínica (follow-ups pendentes)
      // LEFT JOIN clinical_notes — WHERE cn.id IS NULL filtra as que não têm nota
      this.knex('appointments as a')
        .leftJoin('clinical_notes as cn', 'cn.appointment_id', 'a.id')
        .where({ 'a.tenant_id': tenantId, 'a.status': 'completed' })
        .whereNull('cn.id')
        .count('a.id as count')
        .first(),
    ])

    // Knex.count() retorna string do PostgreSQL — converter com Number()
    const totalPatients = Number(totalPatientsResult?.count ?? 0)
    const pendingFollowUps = Number(pendingFollowUpsResult?.count ?? 0)

    return {
      todayAppointments,
      totalPatients,
      pendingFollowUps,
    }
  }

  // US-5.4: Detalhe completo de uma consulta com dados do paciente e notas clínicas
  async getAppointmentDetail(tenantId: string, appointmentId: string) {
    // 1. Buscar a consulta com isolamento de tenant obrigatório — agent_summary excluído
    const appointment = await this.knex('appointments')
      .where({ id: appointmentId, tenant_id: tenantId })
      .select(APPOINTMENT_LIST_FIELDS)
      .first()

    // Se não encontrada ou pertence a outro tenant: 404 (não vazar existência)
    if (!appointment) {
      throw new NotFoundException('Consulta não encontrada')
    }

    // 2. Buscar dados do paciente e notas clínicas em paralelo
    const [patient, clinicalNotes] = await Promise.all([
      this.knex('patients')
        .where({ id: appointment.patient_id, tenant_id: tenantId })
        .select(APPOINTMENT_DETAIL_PATIENT_FIELDS)
        .first(),
      this.knex('clinical_notes')
        .where({ appointment_id: appointmentId, tenant_id: tenantId })
        .select(['id', 'content', 'created_at'])
        .orderBy('created_at', 'asc'),
    ])

    return { appointment, patient, clinicalNotes }
  }

  // US-5.2: Criação manual de consulta pelo doutor com verificação de conflito de horário
  async createAppointment(tenantId: string, dto: CreateAppointmentDto) {
    const { patientId, dateTime, durationMinutes } = dto

    const appointment = await this.knex.transaction(async (trx) => {
      // 1. Verificar se o paciente existe neste tenant — nunca vazar existência de outros tenants
      const patient = await trx('patients')
        .where({ id: patientId, tenant_id: tenantId })
        .select('id', 'name', 'phone')
        .first()

      if (!patient) {
        throw new NotFoundException('Paciente não encontrado')
      }

      // 2. Buscar appointment_duration do doutor se não fornecido no DTO
      let duration: number
      if (durationMinutes === undefined) {
        const doctor = await trx('doctors')
          .where({ tenant_id: tenantId })
          .select('appointment_duration')
          .first()
        duration = doctor?.appointment_duration ?? 30
      } else {
        duration = durationMinutes
      }

      // 3. Calcular o intervalo da nova consulta
      const startTime = new Date(dateTime)
      const endTime = new Date(startTime.getTime() + duration * 60 * 1000)

      // 4. SELECT FOR UPDATE para verificar conflito de horário atomicamente
      // Condição de sobreposição: startA < endB AND endA > startB
      // i.e.: date_time < endTime AND (date_time + duration_minutes * '1 minute') > startTime
      const conflict = await trx('appointments')
        .where({ tenant_id: tenantId, patient_id: patientId })
        .whereNotIn('status', ['cancelled', 'completed'])
        .andWhere('date_time', '<', endTime.toISOString())
        .andWhereRaw(
          `(date_time + duration_minutes * INTERVAL '1 minute') > ?`,
          [startTime.toISOString()],
        )
        .select('id')
        .forUpdate()
        .first()

      if (conflict) {
        throw new ConflictException(
          'Conflito de horário: paciente já possui consulta no mesmo período',
        )
      }

      // 5. Inserir a nova consulta
      const [created] = await trx('appointments')
        .insert({
          tenant_id: tenantId,
          patient_id: patientId,
          date_time: dateTime,
          duration_minutes: duration,
          status: 'scheduled',
          created_by: 'doctor',
        })
        .returning([
          'id',
          'tenant_id',
          'patient_id',
          'date_time',
          'duration_minutes',
          'status',
          'created_by',
          'created_at',
        ])

      // 6. Registrar evento no event_log via EventLogService (audit trail)
      await this.eventLogService.append(tenantId, 'appointment.created', 'doctor', null, {
        appointment_id: created.id,
        patient_id: patientId,
        date_time: dateTime,
        created_by: 'doctor',
      })

      // 7. Emitir evento via EventEmitter2 (reativo — para agent/US-9.4)
      this.eventEmitter.emit('appointment.created', {
        tenantId,
        patientId: patientId as string,
        phone: patient.phone as string,
        dateTime,
        patientName: patient.name as string,
      })

      return created
    })

    return appointment
  }

  // US-5.3: Atualiza o status de uma consulta seguindo a máquina de estados
  async updateAppointmentStatus(
    tenantId: string,
    appointmentId: string,
    dto: UpdateAppointmentStatusDto,
    actorId: string,
  ) {
    return this.knex.transaction(async (trx) => {
      // 1. Buscar a consulta — isolamento de tenant obrigatório
      const appointment = await trx('appointments')
        .where({ id: appointmentId, tenant_id: tenantId })
        .select([
          'id',
          'tenant_id',
          'patient_id',
          'date_time',
          'duration_minutes',
          'status',
          'cancellation_reason',
          'rescheduled_to_id',
          'created_by',
          'started_at',
          'completed_at',
          'created_at',
        ])
        .first()

      if (!appointment) {
        throw new NotFoundException('Consulta não encontrada')
      }

      // 2. Verificar se a transição é válida segundo a máquina de estados
      const VALID_TRANSITIONS: Record<string, string[]> = {
        scheduled: ['waiting', 'cancelled', 'no_show', 'rescheduled'],
        waiting: ['in_progress', 'cancelled', 'no_show'],
        in_progress: ['completed'],
        completed: [],
        cancelled: [],
        no_show: [],
        rescheduled: [],
      }

      const allowedNext = VALID_TRANSITIONS[appointment.status] ?? []
      if (!allowedNext.includes(dto.status)) {
        throw new BadRequestException(
          `Transição inválida: ${appointment.status} → ${dto.status}`,
        )
      }

      // 3. Aplicar a lógica específica de cada transição
      if (dto.status === 'rescheduled') {
        return this._handleRescheduled(trx, appointment, dto, tenantId, actorId)
      }

      // Monta os campos de update conforme o status alvo
      const updateData: Record<string, unknown> = { status: dto.status }

      if (dto.status === 'in_progress') {
        updateData.started_at = this.knex.fn.now()
      } else if (dto.status === 'completed') {
        updateData.completed_at = this.knex.fn.now()
      } else if (dto.status === 'cancelled') {
        updateData.cancellation_reason = dto.cancellationReason
      }

      // 4. Persistir o update
      const [updated] = await trx('appointments')
        .where({ id: appointmentId, tenant_id: tenantId })
        .update(updateData)
        .returning([
          'id',
          'tenant_id',
          'patient_id',
          'date_time',
          'duration_minutes',
          'status',
          'cancellation_reason',
          'rescheduled_to_id',
          'created_by',
          'started_at',
          'completed_at',
          'created_at',
        ])

      // 5. Lógica de ativação do portal do paciente na conclusão
      let portalActivated = false
      let portalAccessCode: string | null = null
      if (dto.status === 'completed') {
        const patient = await trx('patients')
          .where({ id: appointment.patient_id, tenant_id: tenantId })
          .select(['portal_access_code', 'phone', 'name'])
          .first()

        if (!patient?.portal_access_code) {
          const code = generatePortalAccessCode()
          await trx('patients')
            .where({ id: appointment.patient_id, tenant_id: tenantId })
            .update({ portal_access_code: code, portal_active: true })

          await this.eventLogService.append(
            tenantId,
            'patient.portal_activated',
            'system',
            null,
            {
              patient_id: appointment.patient_id,
              patient_name: patient?.name as string | undefined,
              portal_access_code: code,
            },
          )

          // Emitir evento via EventEmitter2 para que o agente envie o código ao paciente
          this.eventEmitter.emit('patient.portal_activated', {
            tenantId,
            patientId: appointment.patient_id,
            phone: patient?.phone as string | undefined,
            portalAccessCode: code,
          })

          portalActivated = true
          portalAccessCode = code
        }
      }

      // 6. Registrar evento de audit trail
      const payload: Record<string, unknown> = {
        appointment_id: appointmentId,
        patient_id: appointment.patient_id,
        old_status: appointment.status,
        new_status: dto.status,
      }

      if (dto.status === 'in_progress') {
        payload.started_at = updated.started_at
      } else if (dto.status === 'completed') {
        payload.completed_at = updated.completed_at
        payload.duration_minutes = appointment.duration_minutes
        payload.portal_activated = portalActivated
      } else if (dto.status === 'cancelled') {
        payload.cancellation_reason = dto.cancellationReason
      }

      await this.eventLogService.append(
        tenantId,
        'appointment.status_changed',
        'doctor',
        actorId,
        payload,
      )

      // 7. Emitir evento via EventEmitter2 para reatividade do agente
      this.eventEmitter.emit('appointment.status_changed', {
        tenantId,
        appointmentId,
        patientId: appointment.patient_id,
        oldStatus: appointment.status,
        newStatus: dto.status,
        reason: dto.status === 'cancelled' ? dto.cancellationReason : undefined,
      })

      // Emitir evento específico de cancelamento com dados para notificação WhatsApp
      if (dto.status === 'cancelled') {
        this.eventEmitter.emit('appointment.cancelled', {
          tenantId,
          appointmentId,
          patientId: appointment.patient_id,
          dateTime: appointment.date_time,
          reason: dto.cancellationReason,
        })
      }

      // Suprimir aviso de variável não usada
      void portalAccessCode

      return updated
    })
  }

  /**
   * Cancela uma consulta em nome do agente WhatsApp.
   * Usa actor_type='agent' e actor_id=null (sem UUID de usuário).
   * Método dedicado para evitar passar string literal como actor_id UUID no evento.
   */
  async cancelByAgent(
    tenantId: string,
    appointmentId: string,
    reason = 'Cancelado pelo paciente via WhatsApp',
  ): Promise<void> {
    const appointment = await this.knex('appointments')
      .where({ id: appointmentId, tenant_id: tenantId })
      .select('id', 'status', 'patient_id', 'date_time')
      .first()

    if (!appointment) {
      throw new NotFoundException('Consulta não encontrada')
    }

    const cancellableStatuses = ['scheduled', 'waiting']
    if (!cancellableStatuses.includes(appointment.status as string)) {
      throw new BadRequestException(
        `Não é possível cancelar uma consulta com status: ${appointment.status}`,
      )
    }

    await this.knex('appointments').where({ id: appointmentId, tenant_id: tenantId }).update({
      status: 'cancelled',
      cancellation_reason: reason,
      updated_at: this.knex.fn.now(),
    })

    await this.eventLogService.append(tenantId, 'appointment.cancelled', 'agent', null, {
      appointment_id: appointmentId,
      patient_id: appointment.patient_id,
      old_status: appointment.status,
      new_status: 'cancelled',
      cancellation_reason: reason,
    })

    this.eventEmitter.emit('appointment.cancelled', {
      tenantId,
      appointmentId,
      patientId: appointment.patient_id,
      dateTime: appointment.date_time,
      reason,
    })
  }

  // Lida com a transição → rescheduled: cria nova consulta e encerra a original
  private async _handleRescheduled(
    trx: Knex.Transaction,
    original: Record<string, unknown>,
    dto: Extract<UpdateAppointmentStatusDto, { status: 'rescheduled' }>,
    tenantId: string,
    actorId: string,
  ) {
    const { newDateTime, cancellationReason } = dto

    // Verificar conflito para o novo horário (SELECT FOR UPDATE)
    const startTime = new Date(newDateTime)
    const duration = original.duration_minutes as number
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000)

    const conflict = await trx('appointments')
      .where({ tenant_id: tenantId, patient_id: original.patient_id as string })
      .whereNotIn('status', ['cancelled', 'completed', 'rescheduled'])
      .andWhere('date_time', '<', endTime.toISOString())
      .andWhereRaw(`(date_time + duration_minutes * INTERVAL '1 minute') > ?`, [
        startTime.toISOString(),
      ])
      .select('id')
      .forUpdate()
      .first()

    if (conflict) {
      throw new ConflictException(
        'Conflito de horário: paciente já possui consulta no mesmo período',
      )
    }

    // Criar a nova consulta com status 'scheduled'
    const [newAppointment] = await trx('appointments')
      .insert({
        tenant_id: tenantId,
        patient_id: original.patient_id,
        date_time: newDateTime,
        duration_minutes: original.duration_minutes,
        status: 'scheduled',
        created_by: 'doctor',
      })
      .returning([
        'id',
        'tenant_id',
        'patient_id',
        'date_time',
        'duration_minutes',
        'status',
        'cancellation_reason',
        'rescheduled_to_id',
        'created_by',
        'started_at',
        'completed_at',
        'created_at',
      ])

    // Atualizar a consulta original: status=rescheduled, rescheduled_to_id, cancellation_reason
    const [updatedOriginal] = await trx('appointments')
      .where({ id: original.id as string, tenant_id: tenantId })
      .update({
        status: 'rescheduled',
        rescheduled_to_id: newAppointment.id,
        cancellation_reason: cancellationReason ?? null,
      })
      .returning([
        'id',
        'tenant_id',
        'patient_id',
        'date_time',
        'duration_minutes',
        'status',
        'cancellation_reason',
        'rescheduled_to_id',
        'created_by',
        'started_at',
        'completed_at',
        'created_at',
      ])

    // Dois eventos no event_log via EventLogService
    await this.eventLogService.append(tenantId, 'appointment.rescheduled', 'doctor', actorId, {
      appointment_id: original.id,
      patient_id: original.patient_id,
      old_status: original.status,
      rescheduled_to_id: newAppointment.id,
      new_date_time: newDateTime,
    })

    await this.eventLogService.append(tenantId, 'appointment.created', 'doctor', actorId, {
      appointment_id: newAppointment.id,
      patient_id: original.patient_id,
      date_time: newDateTime,
      created_by: 'doctor',
    })

    // Emitir evento de status_changed para o original
    this.eventEmitter.emit('appointment.status_changed', {
      tenantId,
      appointmentId: original.id,
      patientId: original.patient_id,
      oldStatus: original.status,
      newStatus: 'rescheduled',
    })

    // Emitir evento de appointment.created para a nova consulta
    this.eventEmitter.emit('appointment.created', {
      tenantId,
      appointmentId: newAppointment.id,
      patientId: original.patient_id,
      dateTime: newDateTime,
    })

    return { original: updatedOriginal, rescheduledTo: newAppointment }
  }
}
