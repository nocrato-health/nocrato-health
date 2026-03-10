import * as crypto from 'crypto'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { Knex } from 'knex'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { KNEX } from '@/database/knex.provider'
import { EventLogService } from '@/modules/event-log/event-log.service'
import { env } from '@/config/env'
import type { BookAppointmentDto, BookInChatDto } from './booking.dto'

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface ValidateTokenResult {
  valid: true
  doctor: { name: string; specialty: string | null }
  tenant: { name: string; primaryColor: string | null; logoUrl: string | null }
  phone: string | null
}

export interface SlotItem {
  start: string // HH:MM
  end: string // HH:MM
}

export interface GetSlotsResult {
  date: string
  slots: SlotItem[]
  timezone: string
  durationMinutes: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Adiciona `minutes` minutos a uma string "HH:MM", retornando "HH:MM". */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Compara duas strings "HH:MM". Retorna negativo, zero ou positivo. */
function compareTime(a: string, b: string): number {
  return a.localeCompare(b)
}

/** Extrai hora local do doutor de um dateTime UTC (ISO string) no timezone especificado. */
function utcToLocalTime(dateTime: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(dateTime))
}

/** Retorna a hora atual no timezone especificado, como string "HH:MM". */
function nowLocalTime(timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

/** Retorna a data de hoje no timezone especificado, como string "YYYY-MM-DD". */
function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
  }).format(new Date()) // en-CA produz formato YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class BookingService {
  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventLogService: EventLogService,
  ) {}

  // -------------------------------------------------------------------------
  // generateToken (US-7.1 — não alterar)
  // -------------------------------------------------------------------------

  async generateToken(
    tenantId: string,
    phone?: string,
  ): Promise<{ token: string; expiresAt: Date; bookingUrl: string }> {
    // 1. Buscar slug do tenant — NotFoundException se não existir
    const tenant = await this.knex('tenants').where({ id: tenantId }).select('slug').first()

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado')
    }

    // 2. Gerar token de 64 chars hexadecimais
    const token = crypto.randomBytes(32).toString('hex')

    // 3. Calcular expiração (24h a partir de agora)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    // 4. Persistir em booking_tokens
    await this.knex('booking_tokens').insert({
      tenant_id: tenantId,
      token,
      phone: phone ?? null,
      expires_at: expiresAt,
      used: false,
    })

    // 5. Construir bookingUrl com slug e token
    const bookingUrl = `${env.FRONTEND_URL}/book/${tenant.slug}?token=${token}`

    return { token, expiresAt, bookingUrl }
  }

  // -------------------------------------------------------------------------
  // validateToken (US-7.2)
  // -------------------------------------------------------------------------

  async validateToken(slug: string, token: string): Promise<ValidateTokenResult> {
    // 1. Buscar tenant ativo pelo slug
    const tenant = await this.knex('tenants')
      .where({ slug, status: 'active' })
      .select(
        'id',
        'name',
        this.knex.raw('primary_color as "primaryColor"'),
        this.knex.raw('logo_url as "logoUrl"'),
      )
      .first()

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado')
    }

    // 2. Buscar token — cross-tenant protection: filtra por tenant_id
    const bookingToken = await this.knex('booking_tokens')
      .where({ token, tenant_id: tenant.id })
      .select(
        'token',
        'phone',
        'used',
        this.knex.raw('expires_at as "expiresAt"'),
      )
      .first()

    if (!bookingToken) {
      throw new ForbiddenException({ valid: false })
    }

    // 3. Token já usado
    if (bookingToken.used) {
      throw new ForbiddenException({ valid: false })
    }

    // 4. Token expirado
    if (new Date(bookingToken.expiresAt) < new Date()) {
      throw new ForbiddenException({ valid: false, reason: 'expired' })
    }

    // 5. Buscar doctor ativo do tenant
    const doctor = await this.knex('doctors')
      .where({ tenant_id: tenant.id, status: 'active' })
      .select('name', 'specialty')
      .first()

    // 6. Retornar resultado
    return {
      valid: true,
      doctor: {
        name: doctor?.name ?? '',
        specialty: doctor?.specialty ?? null,
      },
      tenant: {
        name: tenant.name as string,
        primaryColor: tenant.primaryColor as string | null,
        logoUrl: tenant.logoUrl as string | null,
      },
      phone: (bookingToken.phone as string | null) ?? null,
    }
  }

  // -------------------------------------------------------------------------
  // getSlots (US-7.2)
  // -------------------------------------------------------------------------

  async getSlots(slug: string, token: string, date: string): Promise<GetSlotsResult> {
    // 1. Buscar tenant ativo pelo slug
    const tenant = await this.knex('tenants')
      .where({ slug, status: 'active' })
      .select('id', 'name')
      .first()

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado')
    }

    // 2. Validar token (mesma lógica do validateToken, sem retornar dados do doctor)
    const bookingToken = await this.knex('booking_tokens')
      .where({ token, tenant_id: tenant.id })
      .select('used', this.knex.raw('expires_at as "expiresAt"'))
      .first()

    if (!bookingToken) {
      throw new ForbiddenException({ valid: false })
    }

    if (bookingToken.used) {
      throw new ForbiddenException({ valid: false })
    }

    if (new Date(bookingToken.expiresAt) < new Date()) {
      throw new ForbiddenException({ valid: false, reason: 'expired' })
    }

    // 3. Buscar dados do doctor (working_hours, appointment_duration, timezone)
    const doctor = await this.knex('doctors')
      .where({ tenant_id: tenant.id, status: 'active' })
      .select(
        this.knex.raw('working_hours as "workingHours"'),
        this.knex.raw('appointment_duration as "appointmentDuration"'),
        'timezone',
      )
      .first()

    const workingHours: Record<string, Array<{ start: string; end: string }>> =
      (doctor?.workingHours as Record<string, Array<{ start: string; end: string }>>) ?? {}
    const appointmentDuration: number = (doctor?.appointmentDuration as number) ?? 30
    const timezone: string = (doctor?.timezone as string) ?? 'America/Sao_Paulo'

    // 4. Calcular dia da semana da date (sem timezone — data local)
    const [year, month, day] = date.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    const dayName = DAY_NAMES[d.getDay()]
    const periods = workingHours[dayName] ?? []

    // 5. Dia sem expediente
    if (periods.length === 0) {
      return { date, slots: [], timezone, durationMinutes: appointmentDuration }
    }

    // 6. Gerar todos os slots possíveis para os períodos do dia
    const allSlots: SlotItem[] = []
    for (const period of periods) {
      let current = period.start
      while (compareTime(addMinutes(current, appointmentDuration), period.end) <= 0) {
        allSlots.push({ start: current, end: addMinutes(current, appointmentDuration) })
        current = addMinutes(current, appointmentDuration)
      }
    }

    // 7. Buscar appointments do dia para filtrar slots ocupados
    const dayStart = `${date}T00:00:00.000Z`
    const dayEnd = `${date}T23:59:59.999Z`

    const appointments = await this.knex('appointments')
      .where({ tenant_id: tenant.id })
      .whereNotIn('status', ['cancelled', 'no_show', 'rescheduled'])
      .andWhereBetween('date_time', [dayStart, dayEnd])
      .select(
        this.knex.raw('date_time as "dateTime"'),
        this.knex.raw('duration_minutes as "durationMinutes"'),
      )

    // Converter appointments UTC → hora local do doutor para comparação
    type ApptRow = { dateTime: string; durationMinutes: number }
    const occupiedRanges = (appointments as ApptRow[]).map((appt) => {
      const startLocal = utcToLocalTime(appt.dateTime, timezone)
      const endLocal = addMinutes(startLocal, appt.durationMinutes)
      return { start: startLocal, end: endLocal }
    })

    // Filtrar slots que se sobrepõem a algum appointment (overlap)
    const freeSlots = allSlots.filter((slot) => {
      return !occupiedRanges.some(
        (occ) =>
          compareTime(occ.start, slot.end) < 0 && compareTime(occ.end, slot.start) > 0,
      )
    })

    // 8. Se data=hoje no timezone do doutor, remover slots passados
    const todayStr = todayInTimezone(timezone)
    let finalSlots = freeSlots
    if (date === todayStr) {
      const now = nowLocalTime(timezone)
      finalSlots = freeSlots.filter((slot) => compareTime(slot.end, now) > 0)
    }

    return { date, slots: finalSlots, timezone, durationMinutes: appointmentDuration }
  }

  // -------------------------------------------------------------------------
  // getSlotsInternal (US-7.4) — mesma lógica de getSlots, mas sem token
  // -------------------------------------------------------------------------

  async getSlotsInternal(tenantId: string, date: string): Promise<GetSlotsResult> {
    // 1. Buscar dados do doctor (working_hours, appointment_duration, timezone) diretamente por tenant_id
    const doctor = await this.knex('doctors')
      .where({ tenant_id: tenantId, status: 'active' })
      .select(
        this.knex.raw('working_hours as "workingHours"'),
        this.knex.raw('appointment_duration as "appointmentDuration"'),
        'timezone',
      )
      .first()

    const workingHours: Record<string, Array<{ start: string; end: string }>> =
      (doctor?.workingHours as Record<string, Array<{ start: string; end: string }>>) ?? {}
    const appointmentDuration: number = (doctor?.appointmentDuration as number) ?? 30
    const timezone: string = (doctor?.timezone as string) ?? 'America/Sao_Paulo'

    // 2. Calcular dia da semana da date (sem timezone — data local)
    const [year, month, day] = date.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    const dayName = DAY_NAMES[d.getDay()]
    const periods = workingHours[dayName] ?? []

    // 3. Dia sem expediente
    if (periods.length === 0) {
      return { date, slots: [], timezone, durationMinutes: appointmentDuration }
    }

    // 4. Gerar todos os slots possíveis para os períodos do dia
    const allSlots: SlotItem[] = []
    for (const period of periods) {
      let current = period.start
      while (compareTime(addMinutes(current, appointmentDuration), period.end) <= 0) {
        allSlots.push({ start: current, end: addMinutes(current, appointmentDuration) })
        current = addMinutes(current, appointmentDuration)
      }
    }

    // 5. Buscar appointments do dia para filtrar slots ocupados
    const dayStart = `${date}T00:00:00.000Z`
    const dayEnd = `${date}T23:59:59.999Z`

    const appointments = await this.knex('appointments')
      .where({ tenant_id: tenantId })
      .whereNotIn('status', ['cancelled', 'no_show', 'rescheduled'])
      .andWhereBetween('date_time', [dayStart, dayEnd])
      .select(
        this.knex.raw('date_time as "dateTime"'),
        this.knex.raw('duration_minutes as "durationMinutes"'),
      )

    // Converter appointments UTC → hora local do doutor para comparação
    type ApptRow = { dateTime: string; durationMinutes: number }
    const occupiedRanges = (appointments as ApptRow[]).map((appt) => {
      const startLocal = utcToLocalTime(appt.dateTime, timezone)
      const endLocal = addMinutes(startLocal, appt.durationMinutes)
      return { start: startLocal, end: endLocal }
    })

    // Filtrar slots que se sobrepõem a algum appointment (overlap)
    const freeSlots = allSlots.filter((slot) => {
      return !occupiedRanges.some(
        (occ) =>
          compareTime(occ.start, slot.end) < 0 && compareTime(occ.end, slot.start) > 0,
      )
    })

    // 6. Se data=hoje no timezone do doutor, remover slots passados
    const todayStr = todayInTimezone(timezone)
    let finalSlots = freeSlots
    if (date === todayStr) {
      const now = nowLocalTime(timezone)
      finalSlots = freeSlots.filter((slot) => compareTime(slot.end, now) > 0)
    }

    return { date, slots: finalSlots, timezone, durationMinutes: appointmentDuration }
  }

  // -------------------------------------------------------------------------
  // bookInChat (US-7.4) — booking interno pelo agente WhatsApp (sem token)
  // -------------------------------------------------------------------------

  async bookInChat(
    tenantId: string,
    dto: BookInChatDto,
  ): Promise<{
    appointment: { id: string; dateTime: string; status: string }
    patient: { name: string; phone: string }
  }> {
    return this.knex.transaction(async (trx) => {
      // 1. Buscar doctor ativo do tenant
      const doctor = await trx('doctors')
        .where({ tenant_id: tenantId, status: 'active' })
        .select(
          'id',
          trx.raw('appointment_duration as "appointmentDuration"'),
        )
        .first()

      if (!doctor) {
        throw new NotFoundException('Médico não encontrado ou inativo')
      }

      // 2. Verificar conflito de slot
      const dateTimeUtc = new Date(dto.dateTime).toISOString()

      const conflictResult = await trx('appointments')
        .where({ tenant_id: tenantId })
        .whereNotIn('status', ['cancelled', 'no_show', 'rescheduled'])
        .where({ date_time: dateTimeUtc })
        .count('id as count')
        .first()

      const conflictCount = Number(conflictResult?.count ?? 0)
      if (conflictCount > 0) {
        throw new ConflictException({ code: 'SLOT_CONFLICT', message: 'Horário não disponível' })
      }

      // 3. Verificar limite de 2 consultas ativas por phone
      const activeCountResult = await trx('appointments')
        .join('patients', function () {
          this.on('patients.id', '=', 'appointments.patient_id').andOn(
            'patients.tenant_id',
            '=',
            'appointments.tenant_id',
          )
        })
        .where('appointments.tenant_id', tenantId)
        .where('patients.phone', dto.phone)
        .whereIn('appointments.status', ['scheduled', 'waiting'])
        .count('appointments.id as count')
        .first()

      const activeCount = Number(activeCountResult?.count ?? 0)
      if (activeCount >= 2) {
        throw new UnprocessableEntityException({ code: 'MAX_APPOINTMENTS_REACHED' })
      }

      // 4. findOrCreate patient
      let patient = await trx('patients')
        .where({ phone: dto.phone, tenant_id: tenantId })
        .select('id', 'name', 'phone')
        .first()

      if (!patient) {
        const [created] = await trx('patients')
          .insert({
            tenant_id: tenantId,
            name: dto.name,
            phone: dto.phone,
            source: 'whatsapp_agent',
            status: 'active',
          })
          .returning(['id', 'name', 'phone'])
        patient = created
      }

      const patientId: string = patient.id as string

      // 5. INSERT appointment
      const [appointment] = await trx('appointments')
        .insert({
          tenant_id: tenantId,
          patient_id: patientId,
          date_time: dateTimeUtc,
          duration_minutes: (doctor.appointmentDuration as number) ?? 30,
          status: 'scheduled',
          created_by: 'agent',
        })
        .returning([
          'id',
          trx.raw('date_time as "dateTime"'),
          'status',
        ])

      const appointmentId: string = appointment.id as string

      // 6. Registrar evento no event_log via EventLogService (audit trail)
      await this.eventLogService.append(tenantId, 'appointment.created', 'agent', null, {
        appointmentId,
        patientId,
        source: 'whatsapp_agent',
      })

      // 7. Emitir evento via EventEmitter2 para notificação WhatsApp (US-9.4)
      this.eventEmitter.emit('appointment.created', {
        tenantId,
        patientId,
        phone: dto.phone,
        dateTime: dateTimeUtc,
        patientName: patient.name as string,
      })

      // 8. Retornar resultado (sem doctor, sem message — uso interno)
      return {
        appointment: {
          id: appointmentId,
          dateTime: appointment.dateTime as string,
          status: appointment.status as string,
        },
        patient: {
          name: patient.name as string,
          phone: patient.phone as string,
        },
      }
    })
  }

  // -------------------------------------------------------------------------
  // bookAppointment (US-7.3)
  // -------------------------------------------------------------------------

  async bookAppointment(
    slug: string,
    dto: BookAppointmentDto,
  ): Promise<{
    appointment: { id: string; dateTime: string; status: string }
    patient: { name: string; phone: string }
    doctor: { name: string; specialty: string | null }
    message: string
  }> {
    return this.knex.transaction(async (trx) => {
      // 1. Buscar tenant pelo slug
      const tenant = await trx('tenants')
        .where({ slug, status: 'active' })
        .select('id', 'name')
        .first()

      if (!tenant) {
        throw new NotFoundException('Tenant não encontrado')
      }

      const tenantId: string = tenant.id as string

      // 2. Buscar token — cross-tenant protection: filtra por tenant_id
      const bookingToken = await trx('booking_tokens')
        .where({ token: dto.token, tenant_id: tenantId })
        .select('id', 'phone', 'used', trx.raw('expires_at as "expiresAt"'))
        .first()

      if (!bookingToken) {
        throw new ForbiddenException('Token inválido')
      }

      // 3. Token já usado
      if (bookingToken.used) {
        throw new ForbiddenException('Token já utilizado')
      }

      // 4. Token expirado
      if (new Date() > new Date(bookingToken.expiresAt as string)) {
        throw new ForbiddenException('Token expirado')
      }

      // 4b. Verificar correspondência de phone — evita bypass via DevTools (TD-15)
      // ForbiddenException (não BadRequest) para não criar oracle: atacante não distingue
      // "token válido com phone errado" de "token inválido/expirado"
      if (bookingToken.phone !== null && dto.phone !== bookingToken.phone) {
        throw new ForbiddenException('Token inválido')
      }

      // 5. Buscar doctor ativo do tenant
      const doctor = await trx('doctors')
        .where({ tenant_id: tenantId, status: 'active' })
        .select(
          'id',
          'name',
          'specialty',
          trx.raw('appointment_duration as "appointmentDuration"'),
          'status',
        )
        .first()

      if (!doctor) {
        throw new NotFoundException('Médico não encontrado ou inativo')
      }

      // 6. Verificar conflito de slot — NÃO marcar token como used antes dessa checagem
      const dateTimeUtc = new Date(dto.dateTime).toISOString()

      const conflictResult = await trx('appointments')
        .where({ tenant_id: tenantId })
        .whereNotIn('status', ['cancelled', 'no_show', 'rescheduled'])
        .where({ date_time: dateTimeUtc })
        .count('id as count')
        .first()

      const conflictCount = Number(conflictResult?.count ?? 0)
      if (conflictCount > 0) {
        throw new ConflictException({ code: 'SLOT_CONFLICT', message: 'Horário não disponível' })
      }

      // 7. Verificar limite de 2 consultas ativas por phone
      const activeCountResult = await trx('appointments')
        .join('patients', function () {
          this.on('patients.id', '=', 'appointments.patient_id').andOn(
            'patients.tenant_id',
            '=',
            'appointments.tenant_id',
          )
        })
        .where('appointments.tenant_id', tenantId)
        .where('patients.phone', dto.phone)
        .whereIn('appointments.status', ['scheduled', 'waiting'])
        .count('appointments.id as count')
        .first()

      const activeCount = Number(activeCountResult?.count ?? 0)
      if (activeCount >= 2) {
        throw new UnprocessableEntityException({ code: 'MAX_APPOINTMENTS_REACHED' })
      }

      // 8. findOrCreate patient
      let patient = await trx('patients')
        .where({ phone: dto.phone, tenant_id: tenantId })
        .select('id', 'name', 'phone')
        .first()

      if (!patient) {
        const [created] = await trx('patients')
          .insert({
            tenant_id: tenantId,
            name: dto.name,
            phone: dto.phone,
            source: 'whatsapp_agent',
            status: 'active',
          })
          .returning(['id', 'name', 'phone'])
        patient = created
      }

      const patientId: string = patient.id as string

      // 9. INSERT appointment
      const [appointment] = await trx('appointments')
        .insert({
          tenant_id: tenantId,
          patient_id: patientId,
          date_time: dateTimeUtc,
          duration_minutes: (doctor.appointmentDuration as number) ?? 30,
          status: 'scheduled',
          created_by: 'agent',
        })
        .returning([
          'id',
          trx.raw('date_time as "dateTime"'),
          'status',
        ])

      const appointmentId: string = appointment.id as string

      // 10. Marcar token como usado
      await trx('booking_tokens').where({ id: bookingToken.id }).update({ used: true })

      // 11. Registrar evento no event_log via EventLogService (audit trail)
      await this.eventLogService.append(tenantId, 'appointment.created', 'agent', null, {
        appointmentId,
        patientId,
        source: 'booking_link',
      })

      // 11b. Emitir evento via EventEmitter2 para notificação WhatsApp (US-9.4)
      this.eventEmitter.emit('appointment.created', {
        tenantId,
        patientId,
        phone: dto.phone,
        dateTime: dateTimeUtc,
        patientName: patient.name as string,
      })

      // 12. Retornar resultado
      return {
        appointment: {
          id: appointmentId,
          dateTime: appointment.dateTime as string,
          status: appointment.status as string,
        },
        patient: {
          name: patient.name as string,
          phone: patient.phone as string,
        },
        doctor: {
          name: doctor.name as string,
          specialty: (doctor.specialty as string | null) ?? null,
        },
        message: 'Consulta agendada com sucesso',
      }
    })
  }
}
