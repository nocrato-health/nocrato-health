/**
 * US-5.1 — Listagem paginada de consultas com filtros (AppointmentService)
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder encadeável do Knex
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - Knex.count() retorna string do PostgreSQL — verificamos que o service converte com Number()
 *  - Filtros opcionais: testados individualmente e em combinação
 *  - Isolamento de tenant: WHERE tenant_id é sempre aplicado
 */

// Mockar env ANTES de qualquer import que o carregue transitivamente.
// env.ts chama process.exit(1) se vars estiverem ausentes — não pode rodar em testes.
jest.mock('@/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-16-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_NAME: 'nocrato_test',
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
  },
}))

import { Test, TestingModule } from '@nestjs/testing'
import { AppointmentService } from './appointment.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-1'
const PATIENT_ID = 'patient-uuid-1'
const APPOINTMENT_ID = 'appt-uuid-1'

const makeAppointment = (overrides: Record<string, unknown> = {}) => ({
  id: APPOINTMENT_ID,
  tenant_id: TENANT_ID,
  patient_id: PATIENT_ID,
  date_time: new Date('2026-03-10T14:00:00Z'),
  duration_minutes: 30,
  status: 'scheduled',
  cancellation_reason: null,
  rescheduled_to_id: null,
  created_by: 'doctor',
  started_at: null,
  completed_at: null,
  created_at: new Date('2026-03-01T09:00:00Z'),
  ...overrides,
})

// ---------------------------------------------------------------------------
// Mock Knex factory
// ---------------------------------------------------------------------------

/**
 * Cria um mock do Knex builder encadeável.
 * - Métodos intermediários (where, andWhere, andWhereBetween, clone, select, orderBy, limit, offset):
 *   retornam `this` para suportar encadeamento
 * - Terminais (count + first, data select): resolvem valores via mockResolvedValue
 */
const createMockBuilder = (
  countResult: { count: string },
  dataResult: ReturnType<typeof makeAppointment>[],
) => {
  // Builder compartilhado entre clone original e clone de count
  const builder: Record<string, jest.Mock> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    andWhereBetween: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockResolvedValue(dataResult),
    count: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(countResult),
    clone: jest.fn(),
  }

  // clone() retorna o mesmo builder (os terminais são independentes por Promise)
  builder.clone.mockReturnValue(builder)

  return builder
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AppointmentService', () => {
  let service: AppointmentService
  let mockKnex: jest.Mock

  beforeEach(async () => {
    mockKnex = jest.fn()

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: KNEX, useValue: mockKnex },
      ],
    }).compile()

    service = moduleRef.get<AppointmentService>(AppointmentService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Listagem sem filtros
  // -------------------------------------------------------------------------

  describe('listAppointments — sem filtros', () => {
    it('should return paginated appointments for the tenant', async () => {
      const appointments = [makeAppointment()]
      const builder = createMockBuilder({ count: '1' }, appointments)
      mockKnex.mockReturnValue(builder)

      const result = await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(result.data).toEqual(appointments)
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      })
    })

    it('should always apply WHERE tenant_id for isolation', async () => {
      const builder = createMockBuilder({ count: '0' }, [])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(builder.where).toHaveBeenCalledWith({ tenant_id: TENANT_ID })
    })

    it('should call listAppointments with appointments table', async () => {
      const builder = createMockBuilder({ count: '0' }, [])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(mockKnex).toHaveBeenCalledWith('appointments')
    })

    it('should return empty list when no appointments exist', async () => {
      const builder = createMockBuilder({ count: '0' }, [])
      mockKnex.mockReturnValue(builder)

      const result = await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(result.data).toEqual([])
      expect(result.pagination.total).toBe(0)
      expect(result.pagination.totalPages).toBe(0)
    })

    it('should convert PostgreSQL count string to number', async () => {
      const builder = createMockBuilder({ count: '42' }, [])
      mockKnex.mockReturnValue(builder)

      const result = await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      // count '42' (string do PostgreSQL) deve ser convertido com Number()
      expect(result.pagination.total).toBe(42)
      expect(typeof result.pagination.total).toBe('number')
    })

    it('should order by date_time DESC', async () => {
      const builder = createMockBuilder({ count: '0' }, [])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(builder.orderBy).toHaveBeenCalledWith('date_time', 'desc')
    })
  })

  // -------------------------------------------------------------------------
  // Filtro por status
  // -------------------------------------------------------------------------

  describe('listAppointments — filtro por status', () => {
    it('should apply status filter when provided', async () => {
      const appointments = [makeAppointment({ status: 'scheduled' })]
      const builder = createMockBuilder({ count: '1' }, appointments)
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20, status: 'scheduled' })

      expect(builder.andWhere).toHaveBeenCalledWith({ status: 'scheduled' })
    })

    it('should not apply status filter when omitted', async () => {
      const builder = createMockBuilder({ count: '3' }, [
        makeAppointment({ status: 'scheduled' }),
        makeAppointment({ status: 'completed' }),
        makeAppointment({ status: 'cancelled' }),
      ])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      // andWhere NÃO deve ter sido chamado com status quando o filtro é omitido
      const statusCalls = builder.andWhere.mock.calls.filter(
        (call) => call[0] && typeof call[0] === 'object' && 'status' in call[0],
      )
      expect(statusCalls).toHaveLength(0)
    })

    it('should filter by completed status', async () => {
      const appointments = [makeAppointment({ status: 'completed' })]
      const builder = createMockBuilder({ count: '1' }, appointments)
      mockKnex.mockReturnValue(builder)

      const result = await service.listAppointments(TENANT_ID, { page: 1, limit: 20, status: 'completed' })

      expect(result.data[0].status).toBe('completed')
      expect(builder.andWhere).toHaveBeenCalledWith({ status: 'completed' })
    })

    it('should filter by cancelled status', async () => {
      const builder = createMockBuilder({ count: '0' }, [])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20, status: 'cancelled' })

      expect(builder.andWhere).toHaveBeenCalledWith({ status: 'cancelled' })
    })
  })

  // -------------------------------------------------------------------------
  // Filtro por data
  // -------------------------------------------------------------------------

  describe('listAppointments — filtro por date', () => {
    it('should apply date range filter for the given day in UTC', async () => {
      const appointments = [makeAppointment()]
      const builder = createMockBuilder({ count: '1' }, appointments)
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20, date: '2026-03-10' })

      expect(builder.andWhereBetween).toHaveBeenCalledWith('date_time', [
        '2026-03-10T00:00:00.000Z',
        '2026-03-10T23:59:59.999Z',
      ])
    })

    it('should not apply date filter when date is omitted', async () => {
      const builder = createMockBuilder({ count: '1' }, [makeAppointment()])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(builder.andWhereBetween).not.toHaveBeenCalled()
    })

    it('should correctly compute start and end of day for the given date', async () => {
      const builder = createMockBuilder({ count: '2' }, [makeAppointment(), makeAppointment()])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20, date: '2026-01-15' })

      expect(builder.andWhereBetween).toHaveBeenCalledWith('date_time', [
        '2026-01-15T00:00:00.000Z',
        '2026-01-15T23:59:59.999Z',
      ])
    })
  })

  // -------------------------------------------------------------------------
  // Filtro por patientId
  // -------------------------------------------------------------------------

  describe('listAppointments — filtro por patientId', () => {
    it('should apply patient_id filter when patientId is provided', async () => {
      const appointments = [makeAppointment()]
      const builder = createMockBuilder({ count: '1' }, appointments)
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20, patientId: PATIENT_ID })

      expect(builder.andWhere).toHaveBeenCalledWith({ patient_id: PATIENT_ID })
    })

    it('should not apply patient_id filter when patientId is omitted', async () => {
      const builder = createMockBuilder({ count: '2' }, [makeAppointment(), makeAppointment()])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      const patientCalls = builder.andWhere.mock.calls.filter(
        (call) => call[0] && typeof call[0] === 'object' && 'patient_id' in call[0],
      )
      expect(patientCalls).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // Combinação de filtros
  // -------------------------------------------------------------------------

  describe('listAppointments — combinação de filtros', () => {
    it('should apply all filters simultaneously when all are provided', async () => {
      const appointments = [makeAppointment({ status: 'scheduled' })]
      const builder = createMockBuilder({ count: '1' }, appointments)
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, {
        page: 1,
        limit: 20,
        status: 'scheduled',
        date: '2026-03-10',
        patientId: PATIENT_ID,
      })

      expect(builder.where).toHaveBeenCalledWith({ tenant_id: TENANT_ID })
      expect(builder.andWhere).toHaveBeenCalledWith({ status: 'scheduled' })
      expect(builder.andWhere).toHaveBeenCalledWith({ patient_id: PATIENT_ID })
      expect(builder.andWhereBetween).toHaveBeenCalledWith('date_time', [
        '2026-03-10T00:00:00.000Z',
        '2026-03-10T23:59:59.999Z',
      ])
    })

    it('should apply status + patientId without date', async () => {
      const builder = createMockBuilder({ count: '1' }, [makeAppointment()])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, {
        page: 1,
        limit: 20,
        status: 'in_progress',
        patientId: PATIENT_ID,
      })

      expect(builder.andWhere).toHaveBeenCalledWith({ status: 'in_progress' })
      expect(builder.andWhere).toHaveBeenCalledWith({ patient_id: PATIENT_ID })
      expect(builder.andWhereBetween).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Isolamento de tenant
  // -------------------------------------------------------------------------

  describe('isolamento de tenant', () => {
    it('should always scope queries to the authenticated tenant', async () => {
      const OTHER_TENANT = 'other-tenant-uuid'
      const builder = createMockBuilder({ count: '0' }, [])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(OTHER_TENANT, { page: 1, limit: 20 })

      // WHERE deve ser chamado com o tenant correto
      expect(builder.where).toHaveBeenCalledWith({ tenant_id: OTHER_TENANT })
      // e NÃO com o tenant errado
      expect(builder.where).not.toHaveBeenCalledWith({ tenant_id: TENANT_ID })
    })

    it('should apply tenant filter regardless of other filters', async () => {
      const builder = createMockBuilder({ count: '5' }, [makeAppointment()])
      mockKnex.mockReturnValue(builder)

      await service.listAppointments(TENANT_ID, {
        page: 2,
        limit: 10,
        status: 'waiting',
        patientId: PATIENT_ID,
        date: '2026-03-10',
      })

      // tenant_id sempre presente independente dos outros filtros
      expect(builder.where).toHaveBeenCalledWith({ tenant_id: TENANT_ID })
    })
  })

  // -------------------------------------------------------------------------
  // Paginação
  // -------------------------------------------------------------------------

  describe('paginação', () => {
    it('should calculate correct offset for page 2', async () => {
      const builder = createMockBuilder({ count: '25' }, [makeAppointment()])
      mockKnex.mockReturnValue(builder)

      const result = await service.listAppointments(TENANT_ID, { page: 2, limit: 10 })

      // offset = (2 - 1) * 10 = 10
      expect(builder.offset).toHaveBeenCalledWith(10)
      expect(builder.limit).toHaveBeenCalledWith(10)
      expect(result.pagination.page).toBe(2)
      expect(result.pagination.limit).toBe(10)
    })

    it('should calculate totalPages correctly with remainder', async () => {
      const builder = createMockBuilder({ count: '25' }, [makeAppointment()])
      mockKnex.mockReturnValue(builder)

      const result = await service.listAppointments(TENANT_ID, { page: 1, limit: 10 })

      // totalPages = ceil(25 / 10) = 3
      expect(result.pagination.total).toBe(25)
      expect(result.pagination.totalPages).toBe(3)
    })

    it('should calculate totalPages = 0 when total is 0', async () => {
      const builder = createMockBuilder({ count: '0' }, [])
      mockKnex.mockReturnValue(builder)

      const result = await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(result.pagination.totalPages).toBe(0)
    })

    it('should apply default page=1 and limit=20 from DTO defaults', async () => {
      const builder = createMockBuilder({ count: '3' }, [makeAppointment()])
      mockKnex.mockReturnValue(builder)

      const result = await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(result.pagination.page).toBe(1)
      expect(result.pagination.limit).toBe(20)
      // offset = (1 - 1) * 20 = 0
      expect(builder.offset).toHaveBeenCalledWith(0)
    })

    it('should return correct totalPages for exact division', async () => {
      const builder = createMockBuilder({ count: '40' }, [makeAppointment()])
      mockKnex.mockReturnValue(builder)

      const result = await service.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      // totalPages = ceil(40 / 20) = 2
      expect(result.pagination.totalPages).toBe(2)
    })
  })
})

// ---------------------------------------------------------------------------
// Suite: createAppointment (US-5.2)
// ---------------------------------------------------------------------------

describe('AppointmentService — createAppointment', () => {
  let service: AppointmentService
  // O service usa this.knex.transaction(...) — o mock precisa ter `.transaction` como propriedade
  // typed. Usamos `as jest.Mock & { transaction: jest.Mock }` para satisfazer o TypeScript.
  let mockKnex: jest.Mock & { transaction: jest.Mock }

  // Fixtures
  const TENANT_ID = 'tenant-uuid-1'
  const PATIENT_ID = 'patient-uuid-1'
  const APPOINTMENT_ID = 'appt-uuid-new'
  const DATE_TIME = '2026-03-15T10:00:00.000Z'
  const DURATION = 30

  const makeCreatedAppointment = (overrides: Record<string, unknown> = {}) => ({
    id: APPOINTMENT_ID,
    tenant_id: TENANT_ID,
    patient_id: PATIENT_ID,
    date_time: new Date(DATE_TIME),
    duration_minutes: DURATION,
    status: 'scheduled',
    created_by: 'doctor',
    created_at: new Date('2026-03-01T09:00:00Z'),
    ...overrides,
  })

  /**
   * Cria um mock de `trx` que roteia chamadas por nome de tabela.
   * Cada tabela tem seu próprio builder com respostas configuráveis.
   */
  const createMockTrx = (options: {
    patient?: Record<string, unknown> | null
    doctor?: { appointment_duration: number } | null
    conflict?: { id: string } | null
    insertedAppointment?: Record<string, unknown>
  }) => {
    const {
      patient = { id: PATIENT_ID },
      doctor = { appointment_duration: DURATION },
      conflict = null,
      insertedAppointment = makeCreatedAppointment(),
    } = options

    // Builder para tabela patients (select .first())
    const patientBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(patient),
    }

    // Builder para tabela doctors (select .first())
    const doctorBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(doctor),
    }

    // Builder para conflito de appointments (chain completa + forUpdate + first)
    const conflictBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      andWhereRaw: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      forUpdate: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(conflict),
    }

    // Builder para insert de appointment (insert + returning)
    const mockReturning = jest.fn().mockResolvedValue([insertedAppointment])
    const appointmentInsertBuilder = {
      insert: jest.fn().mockReturnThis(),
      returning: mockReturning,
    }

    // Builder para insert de event_log
    const eventLogBuilder = {
      insert: jest.fn().mockResolvedValue([{ id: 'event-uuid-1' }]),
    }

    // Contador para diferenciar a primeira chamada a 'appointments' (conflito)
    // da segunda (insert) dentro da transação
    let appointmentsCallCount = 0

    const trx = jest.fn().mockImplementation((table: string) => {
      if (table === 'patients') return patientBuilder
      if (table === 'doctors') return doctorBuilder
      if (table === 'event_log') return eventLogBuilder
      if (table === 'appointments') {
        appointmentsCallCount++
        // 1ª chamada = query de conflito; 2ª chamada = insert
        return appointmentsCallCount === 1 ? conflictBuilder : appointmentInsertBuilder
      }
      throw new Error(`Tabela inesperada no mock: ${table}`)
    })

    return { trx, patientBuilder, doctorBuilder, conflictBuilder, appointmentInsertBuilder, eventLogBuilder }
  }

  beforeEach(async () => {
    // Cria o mock como objeto com `.transaction` já presente para evitar erro TS2339
    const transactionMock = jest.fn()
    mockKnex = Object.assign(jest.fn(), { transaction: transactionMock }) as jest.Mock & {
      transaction: jest.Mock
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: KNEX, useValue: mockKnex },
      ],
    }).compile()

    service = moduleRef.get<AppointmentService>(AppointmentService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // CT-52-01: Sucesso — retorna 201 com appointment
  // -------------------------------------------------------------------------

  it('CT-52-01: should create and return the appointment on success', async () => {
    const { trx } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: DURATION }
    const result = await service.createAppointment(TENANT_ID, dto)

    expect(result).toMatchObject({
      id: APPOINTMENT_ID,
      tenant_id: TENANT_ID,
      patient_id: PATIENT_ID,
      status: 'scheduled',
      created_by: 'doctor',
      duration_minutes: DURATION,
    })
  })

  it('CT-52-01b: should insert appointment with correct fields', async () => {
    const { trx, appointmentInsertBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: DURATION }
    await service.createAppointment(TENANT_ID, dto)

    expect(appointmentInsertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        patient_id: PATIENT_ID,
        date_time: DATE_TIME,
        duration_minutes: DURATION,
        status: 'scheduled',
        created_by: 'doctor',
      }),
    )
  })

  it('CT-52-01c: should insert event_log entry on success', async () => {
    const { trx, eventLogBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: DURATION }
    await service.createAppointment(TENANT_ID, dto)

    expect(eventLogBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        event_type: 'appointment.created',
        actor_type: 'doctor',
        payload: expect.objectContaining({
          appointment_id: APPOINTMENT_ID,
          patient_id: PATIENT_ID,
          created_by: 'doctor',
        }),
      }),
    )
  })

  // -------------------------------------------------------------------------
  // CT-52-02: 404 se paciente não existe
  // -------------------------------------------------------------------------

  it('CT-52-02: should throw NotFoundException when patient does not exist', async () => {
    const { trx } = createMockTrx({ patient: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: DURATION }

    await expect(service.createAppointment(TENANT_ID, dto)).rejects.toThrow('Paciente não encontrado')
  })

  it('CT-52-02b: should not proceed to insert when patient not found', async () => {
    const { trx, appointmentInsertBuilder } = createMockTrx({ patient: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: DURATION }

    await expect(service.createAppointment(TENANT_ID, dto)).rejects.toThrow()
    expect(appointmentInsertBuilder.insert).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // CT-52-03: 409 se conflito de horário
  // -------------------------------------------------------------------------

  it('CT-52-03: should throw ConflictException when schedule conflict exists', async () => {
    const { trx } = createMockTrx({ conflict: { id: 'existing-appt-uuid' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: DURATION }

    await expect(service.createAppointment(TENANT_ID, dto)).rejects.toThrow(
      'Conflito de horário: paciente já possui consulta no mesmo período',
    )
  })

  it('CT-52-03b: should not insert appointment when conflict is found', async () => {
    const { trx, appointmentInsertBuilder } = createMockTrx({ conflict: { id: 'existing-appt-uuid' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: DURATION }

    await expect(service.createAppointment(TENANT_ID, dto)).rejects.toThrow()
    expect(appointmentInsertBuilder.insert).not.toHaveBeenCalled()
  })

  it('CT-52-03c: should query conflict with correct tenant and patient scope', async () => {
    const { trx, conflictBuilder } = createMockTrx({ conflict: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: DURATION }
    await service.createAppointment(TENANT_ID, dto)

    expect(conflictBuilder.where).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      patient_id: PATIENT_ID,
    })
    expect(conflictBuilder.whereNotIn).toHaveBeenCalledWith('status', ['cancelled', 'completed'])
  })

  // -------------------------------------------------------------------------
  // CT-52-04: durationMinutes ausente → usa doctor.appointment_duration
  // -------------------------------------------------------------------------

  it('CT-52-04: should use doctor appointment_duration when durationMinutes is not provided', async () => {
    const doctorDuration = 45
    const { trx, doctorBuilder, appointmentInsertBuilder } = createMockTrx({
      doctor: { appointment_duration: doctorDuration },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    // Sem durationMinutes no DTO
    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME }
    await service.createAppointment(TENANT_ID, dto)

    // Deve ter consultado a tabela doctors
    expect(doctorBuilder.where).toHaveBeenCalledWith({ tenant_id: TENANT_ID })
    expect(doctorBuilder.select).toHaveBeenCalledWith('appointment_duration')

    // Deve ter inserido com a duração do doutor
    expect(appointmentInsertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ duration_minutes: doctorDuration }),
    )
  })

  it('CT-52-04b: should fall back to 30 minutes when doctor has no appointment_duration set', async () => {
    const { trx, appointmentInsertBuilder } = createMockTrx({
      doctor: null,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME }
    await service.createAppointment(TENANT_ID, dto)

    expect(appointmentInsertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ duration_minutes: 30 }),
    )
  })

  // -------------------------------------------------------------------------
  // CT-52-05: durationMinutes fornecido → usa o fornecido (não consulta doctors)
  // -------------------------------------------------------------------------

  it('CT-52-05: should use provided durationMinutes and skip doctor lookup', async () => {
    const { trx, doctorBuilder, appointmentInsertBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: 60 }
    await service.createAppointment(TENANT_ID, dto)

    // NÃO deve ter consultado a tabela doctors
    expect(doctorBuilder.where).not.toHaveBeenCalled()

    // Deve ter inserido com o durationMinutes fornecido
    expect(appointmentInsertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ duration_minutes: 60 }),
    )
  })

  it('CT-52-05b: should isolate tenant in patient lookup', async () => {
    const { trx, patientBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const dto = { patientId: PATIENT_ID, dateTime: DATE_TIME, durationMinutes: DURATION }
    await service.createAppointment(TENANT_ID, dto)

    expect(patientBuilder.where).toHaveBeenCalledWith({
      id: PATIENT_ID,
      tenant_id: TENANT_ID,
    })
  })
})

// ---------------------------------------------------------------------------
// Suite: updateAppointmentStatus (US-5.3)
// ---------------------------------------------------------------------------

describe('AppointmentService — updateAppointmentStatus', () => {
  let service: AppointmentService
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockKnex: jest.Mock & { transaction: jest.Mock; fn: any }

  const TENANT_ID = 'tenant-uuid-1'
  const PATIENT_ID = 'patient-uuid-1'
  const APPOINTMENT_ID = 'appt-uuid-1'
  const ACTOR_ID = 'doctor-uuid-1'

  const makeAppt = (status: string, overrides: Record<string, unknown> = {}) => ({
    id: APPOINTMENT_ID,
    tenant_id: TENANT_ID,
    patient_id: PATIENT_ID,
    date_time: new Date('2026-03-10T14:00:00Z'),
    duration_minutes: 30,
    status,
    cancellation_reason: null,
    rescheduled_to_id: null,
    created_by: 'doctor',
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-03-01T09:00:00Z'),
    ...overrides,
  })

  /**
   * Mock trx para transições normais (não-rescheduled).
   * appointments: 1ª chamada = SELECT, 2ª = UPDATE
   * patients: 1ª chamada = SELECT, 2ª = UPDATE (somente para completed)
   */
  const createMockTrxNormal = (opts: {
    existing?: Record<string, unknown> | null
    updated?: Record<string, unknown>
    patient?: { portal_access_code: string | null } | null
  }) => {
    const {
      existing = makeAppt('scheduled'),
      updated = makeAppt('waiting', { status: 'waiting' }),
      patient = { portal_access_code: 'EXISTING-CODE' },
    } = opts

    const apptSelectBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(existing),
    }
    const apptUpdateBuilder = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([updated]),
    }
    const patientSelectBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(patient),
    }
    const patientUpdateBuilder = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
    }
    const eventLogBuilder = {
      insert: jest.fn().mockResolvedValue([{ id: 'evt-uuid' }]),
    }

    let apptCalls = 0
    let patientCalls = 0
    const trx = jest.fn().mockImplementation((table: string) => {
      if (table === 'appointments') {
        apptCalls++
        return apptCalls === 1 ? apptSelectBuilder : apptUpdateBuilder
      }
      if (table === 'patients') {
        patientCalls++
        return patientCalls === 1 ? patientSelectBuilder : patientUpdateBuilder
      }
      if (table === 'event_log') return eventLogBuilder
      throw new Error(`Tabela inesperada no mock: ${table}`)
    })

    return { trx, apptSelectBuilder, apptUpdateBuilder, patientSelectBuilder, patientUpdateBuilder, eventLogBuilder }
  }

  /**
   * Mock trx para a transição rescheduled.
   * appointments: 1ª = SELECT existing, 2ª = SELECT FOR UPDATE conflict,
   *               3ª = INSERT new, 4ª = UPDATE original
   */
  const createMockTrxRescheduled = (opts: {
    existing?: Record<string, unknown>
    conflict?: { id: string } | null
    newAppointment?: Record<string, unknown>
    updatedOriginal?: Record<string, unknown>
  }) => {
    const {
      existing = makeAppt('scheduled'),
      conflict = null,
      newAppointment = makeAppt('scheduled', { id: 'new-appt-uuid' }),
      updatedOriginal = makeAppt('rescheduled', {
        status: 'rescheduled',
        rescheduled_to_id: 'new-appt-uuid',
      }),
    } = opts

    const selectBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(existing),
    }
    const conflictBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      andWhereRaw: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      forUpdate: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(conflict),
    }
    const insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([newAppointment]),
    }
    const updateBuilder = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([updatedOriginal]),
    }
    const eventLogBuilder = {
      insert: jest.fn().mockResolvedValue([{ id: 'evt-uuid' }]),
    }

    let apptCalls = 0
    const trx = jest.fn().mockImplementation((table: string) => {
      if (table === 'appointments') {
        apptCalls++
        if (apptCalls === 1) return selectBuilder
        if (apptCalls === 2) return conflictBuilder
        if (apptCalls === 3) return insertBuilder
        return updateBuilder
      }
      if (table === 'event_log') return eventLogBuilder
      throw new Error(`Tabela inesperada no mock: ${table}`)
    })

    return { trx, selectBuilder, conflictBuilder, insertBuilder, updateBuilder, eventLogBuilder }
  }

  beforeEach(async () => {
    const transactionMock = jest.fn()
    mockKnex = Object.assign(jest.fn(), {
      transaction: transactionMock,
      fn: { now: jest.fn().mockReturnValue('NOW()') },
    }) as jest.Mock & { transaction: jest.Mock; fn: { now: jest.Mock } }

    const moduleRef = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: KNEX, useValue: mockKnex },
      ],
    }).compile()

    service = moduleRef.get<AppointmentService>(AppointmentService)
  })

  afterEach(() => jest.clearAllMocks())

  // -------------------------------------------------------------------------
  // CT-53-01: scheduled → waiting
  // -------------------------------------------------------------------------

  it('CT-53-01: should transition scheduled → waiting and return updated appointment', async () => {
    const existing = makeAppt('scheduled')
    const updated = makeAppt('waiting', { status: 'waiting' })
    const { trx } = createMockTrxNormal({ existing, updated })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const result = await service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'waiting' }, ACTOR_ID)

    expect(result).toMatchObject({ status: 'waiting' })
  })

  it('CT-53-01b: should query appointment with tenant isolation', async () => {
    const { trx, apptSelectBuilder } = createMockTrxNormal({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'waiting' }, ACTOR_ID)

    expect(apptSelectBuilder.where).toHaveBeenCalledWith({ id: APPOINTMENT_ID, tenant_id: TENANT_ID })
  })

  it('CT-53-01c: should record actor_id in event_log', async () => {
    const { trx, eventLogBuilder } = createMockTrxNormal({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'waiting' }, ACTOR_ID)

    expect(eventLogBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        event_type: 'appointment.status_changed',
        actor_type: 'doctor',
        actor_id: ACTOR_ID,
        payload: expect.objectContaining({ old_status: 'scheduled', new_status: 'waiting' }),
      }),
    )
  })

  // -------------------------------------------------------------------------
  // CT-53-02: waiting → in_progress + started_at
  // -------------------------------------------------------------------------

  it('CT-53-02: should set started_at when transitioning to in_progress', async () => {
    const existing = makeAppt('waiting')
    const updated = makeAppt('in_progress', { status: 'in_progress', started_at: new Date() })
    const { trx, apptUpdateBuilder } = createMockTrxNormal({ existing, updated })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const result = await service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'in_progress' }, ACTOR_ID)

    expect(result).toMatchObject({ status: 'in_progress' })
    expect(apptUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_progress', started_at: expect.anything() }),
    )
  })

  // -------------------------------------------------------------------------
  // CT-53-03: in_progress → completed — paciente já tem portal_access_code
  // -------------------------------------------------------------------------

  it('CT-53-03: should not generate portal_access_code when patient already has one', async () => {
    const existing = makeAppt('in_progress')
    const updated = makeAppt('completed', { status: 'completed', completed_at: new Date() })
    const { trx, patientUpdateBuilder, eventLogBuilder } = createMockTrxNormal({
      existing,
      updated,
      patient: { portal_access_code: 'ABC-1234-XYZ' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'completed' }, ACTOR_ID)

    expect(patientUpdateBuilder.update).not.toHaveBeenCalled()
    expect(eventLogBuilder.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'patient.portal_activated' }),
    )
  })

  // -------------------------------------------------------------------------
  // CT-53-04: in_progress → completed (1ª consulta) → gera portal_access_code
  // -------------------------------------------------------------------------

  it('CT-53-04: should generate portal_access_code in AAA-1234-BBB format on first completion', async () => {
    const existing = makeAppt('in_progress')
    const updated = makeAppt('completed', { status: 'completed', completed_at: new Date() })
    const { trx, patientUpdateBuilder } = createMockTrxNormal({
      existing,
      updated,
      patient: { portal_access_code: null },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'completed' }, ACTOR_ID)

    expect(patientUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        portal_active: true,
        portal_access_code: expect.stringMatching(/^[A-HJ-NP-Z]{3}-\d{4}-[A-HJ-NP-Z]{3}$/),
      }),
    )
  })

  it('CT-53-04b: should emit patient.portal_activated event on first completion', async () => {
    const existing = makeAppt('in_progress')
    const updated = makeAppt('completed', { status: 'completed', completed_at: new Date() })
    const { trx, eventLogBuilder } = createMockTrxNormal({
      existing,
      updated,
      patient: { portal_access_code: null },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'completed' }, ACTOR_ID)

    expect(eventLogBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'patient.portal_activated',
        actor_type: 'doctor',
        actor_id: ACTOR_ID,
      }),
    )
  })

  // -------------------------------------------------------------------------
  // CT-53-06: cancelled com motivo
  // -------------------------------------------------------------------------

  it('CT-53-06: should persist cancellation_reason on cancelled transition', async () => {
    const existing = makeAppt('scheduled')
    const updated = makeAppt('cancelled', {
      status: 'cancelled',
      cancellation_reason: 'Paciente cancelou',
    })
    const { trx, apptUpdateBuilder } = createMockTrxNormal({ existing, updated })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const result = await service.updateAppointmentStatus(
      TENANT_ID,
      APPOINTMENT_ID,
      { status: 'cancelled', cancellationReason: 'Paciente cancelou' },
      ACTOR_ID,
    )

    expect(result).toMatchObject({ status: 'cancelled' })
    expect(apptUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled',
        cancellation_reason: 'Paciente cancelou',
      }),
    )
  })

  // -------------------------------------------------------------------------
  // CT-53-07: rescheduled → nova consulta + atualiza original + 2 eventos
  // -------------------------------------------------------------------------

  it('CT-53-07: should create new appointment and update original on rescheduled', async () => {
    const existing = makeAppt('scheduled')
    const newAppt = makeAppt('scheduled', { id: 'new-appt-uuid', date_time: new Date('2026-03-20T09:00:00Z') })
    const updatedOriginal = makeAppt('rescheduled', {
      status: 'rescheduled',
      rescheduled_to_id: 'new-appt-uuid',
    })
    const { trx } = createMockTrxRescheduled({ existing, newAppointment: newAppt, updatedOriginal })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const result = await service.updateAppointmentStatus(
      TENANT_ID,
      APPOINTMENT_ID,
      { status: 'rescheduled', newDateTime: '2026-03-20T09:00:00.000Z' },
      ACTOR_ID,
    )

    expect(result).toMatchObject({
      original: { status: 'rescheduled', rescheduled_to_id: 'new-appt-uuid' },
      rescheduledTo: { status: 'scheduled', id: 'new-appt-uuid' },
    })
  })

  it('CT-53-07b: should emit two event_log entries for rescheduled', async () => {
    const existing = makeAppt('scheduled')
    const newAppt = makeAppt('scheduled', { id: 'new-appt-uuid' })
    const updatedOriginal = makeAppt('rescheduled', {
      status: 'rescheduled',
      rescheduled_to_id: 'new-appt-uuid',
    })
    const { trx, eventLogBuilder } = createMockTrxRescheduled({ existing, newAppointment: newAppt, updatedOriginal })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.updateAppointmentStatus(
      TENANT_ID,
      APPOINTMENT_ID,
      { status: 'rescheduled', newDateTime: '2026-03-20T09:00:00.000Z' },
      ACTOR_ID,
    )

    expect(eventLogBuilder.insert).toHaveBeenCalledTimes(2)
    expect(eventLogBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'appointment.rescheduled' }),
    )
    expect(eventLogBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'appointment.created' }),
    )
  })

  it('CT-53-07c: should reject rescheduled if new datetime has conflict', async () => {
    const existing = makeAppt('scheduled')
    const { trx } = createMockTrxRescheduled({
      existing,
      conflict: { id: 'conflicting-appt-uuid' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.updateAppointmentStatus(
        TENANT_ID,
        APPOINTMENT_ID,
        { status: 'rescheduled', newDateTime: '2026-03-20T09:00:00.000Z' },
        ACTOR_ID,
      ),
    ).rejects.toThrow('Conflito de horário: paciente já possui consulta no mesmo período')
  })

  // -------------------------------------------------------------------------
  // CT-53-08: transição inválida → 400
  // -------------------------------------------------------------------------

  it('CT-53-08: should throw BadRequestException on invalid transition', async () => {
    const existing = makeAppt('completed')
    const { trx } = createMockTrxNormal({ existing })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'in_progress' } as any, ACTOR_ID),
    ).rejects.toThrow('Transição inválida: completed → in_progress')
  })

  it('CT-53-08b: should throw BadRequestException for no_show from in_progress', async () => {
    const existing = makeAppt('in_progress')
    const { trx } = createMockTrxNormal({ existing })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'no_show' } as any, ACTOR_ID),
    ).rejects.toThrow('Transição inválida: in_progress → no_show')
  })

  // -------------------------------------------------------------------------
  // CT-53-09: consulta de outro tenant → 404
  // -------------------------------------------------------------------------

  it('CT-53-09: should throw NotFoundException when appointment not in tenant', async () => {
    const { trx } = createMockTrxNormal({ existing: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, { status: 'waiting' }, ACTOR_ID),
    ).rejects.toThrow('Consulta não encontrada')
  })
})

// ---------------------------------------------------------------------------
// Suite: getAppointmentDetail (US-5.4)
// ---------------------------------------------------------------------------

describe('AppointmentService — getAppointmentDetail', () => {
  let service: AppointmentService
  let mockKnex: jest.Mock

  const TENANT_ID = 'tenant-uuid-1'
  const OTHER_TENANT_ID = 'tenant-uuid-2'
  const PATIENT_ID = 'patient-uuid-1'
  const APPOINTMENT_ID = 'appt-uuid-1'

  const makeAppointment = (overrides: Record<string, unknown> = {}) => ({
    id: APPOINTMENT_ID,
    tenant_id: TENANT_ID,
    patient_id: PATIENT_ID,
    date_time: new Date('2026-03-10T14:00:00Z'),
    duration_minutes: 30,
    status: 'scheduled',
    cancellation_reason: null,
    rescheduled_to_id: null,
    created_by: 'doctor',
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-03-01T09:00:00Z'),
    ...overrides,
  })

  const makePatient = (overrides: Record<string, unknown> = {}) => ({
    id: PATIENT_ID,
    name: 'João Silva',
    phone: '11999999999',
    email: 'joao@example.com',
    source: 'manual',
    status: 'active',
    portal_active: false,
    created_at: new Date('2026-02-01T09:00:00Z'),
    ...overrides,
  })

  const makeClinicalNote = (overrides: Record<string, unknown> = {}) => ({
    id: 'note-uuid-1',
    content: 'Paciente apresentou melhora.',
    created_at: new Date('2026-03-10T15:00:00Z'),
    ...overrides,
  })

  /**
   * Cria mock do Knex com roteamento por tabela.
   * - appointments: .where().select().first() → retorna appointment ou undefined
   * - patients: .where().select().first() → retorna patient ou undefined
   * - clinical_notes: .where().select().orderBy() → retorna array de notas
   */
  const createMockKnex = (opts: {
    appointment?: Record<string, unknown> | null
    patient?: Record<string, unknown> | null
    clinicalNotes?: Record<string, unknown>[]
  }) => {
    const {
      appointment = makeAppointment(),
      patient = makePatient(),
      clinicalNotes = [makeClinicalNote()],
    } = opts

    const appointmentBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(appointment ?? undefined),
    }

    const patientBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(patient ?? undefined),
    }

    const clinicalNotesBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue(clinicalNotes),
    }

    const knex = jest.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return appointmentBuilder
      if (table === 'patients') return patientBuilder
      if (table === 'clinical_notes') return clinicalNotesBuilder
      throw new Error(`Tabela inesperada no mock: ${table}`)
    })

    return { knex, appointmentBuilder, patientBuilder, clinicalNotesBuilder }
  }

  beforeEach(async () => {
    mockKnex = jest.fn()

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: KNEX, useValue: mockKnex },
      ],
    }).compile()

    service = moduleRef.get<AppointmentService>(AppointmentService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // CT-54-01: Happy path — retorna { appointment, patient, clinicalNotes }
  // -------------------------------------------------------------------------

  it('CT-54-01: should return appointment, patient and clinicalNotes on success', async () => {
    const appt = makeAppointment()
    const patient = makePatient()
    const notes = [makeClinicalNote()]
    const { knex } = createMockKnex({ appointment: appt, patient, clinicalNotes: notes })
    mockKnex.mockImplementation(knex)

    const result = await service.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)

    expect(result).toEqual({ appointment: appt, patient, clinicalNotes: notes })
  })

  it('CT-54-01b: should query appointments with correct tenant and appointment id', async () => {
    const { knex, appointmentBuilder } = createMockKnex({})
    mockKnex.mockImplementation(knex)

    await service.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)

    expect(appointmentBuilder.where).toHaveBeenCalledWith({
      id: APPOINTMENT_ID,
      tenant_id: TENANT_ID,
    })
  })

  it('CT-54-01c: should query patient with correct tenant and patient_id from appointment', async () => {
    const { knex, patientBuilder } = createMockKnex({})
    mockKnex.mockImplementation(knex)

    await service.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)

    expect(patientBuilder.where).toHaveBeenCalledWith({
      id: PATIENT_ID,
      tenant_id: TENANT_ID,
    })
  })

  it('CT-54-01d: should query clinical_notes with correct appointment_id and tenant_id', async () => {
    const { knex, clinicalNotesBuilder } = createMockKnex({})
    mockKnex.mockImplementation(knex)

    await service.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)

    expect(clinicalNotesBuilder.where).toHaveBeenCalledWith({
      appointment_id: APPOINTMENT_ID,
      tenant_id: TENANT_ID,
    })
  })

  it('CT-54-01e: should order clinical_notes by created_at asc', async () => {
    const { knex, clinicalNotesBuilder } = createMockKnex({})
    mockKnex.mockImplementation(knex)

    await service.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)

    expect(clinicalNotesBuilder.orderBy).toHaveBeenCalledWith('created_at', 'asc')
  })

  // -------------------------------------------------------------------------
  // CT-54-02: 404 — consulta não encontrada
  // -------------------------------------------------------------------------

  it('CT-54-02: should throw NotFoundException when appointment does not exist', async () => {
    const { knex } = createMockKnex({ appointment: null })
    mockKnex.mockImplementation(knex)

    await expect(service.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)).rejects.toThrow(
      'Consulta não encontrada',
    )
  })

  it('CT-54-02b: should not query patients or clinical_notes when appointment not found', async () => {
    const { knex, patientBuilder, clinicalNotesBuilder } = createMockKnex({ appointment: null })
    mockKnex.mockImplementation(knex)

    await expect(service.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)).rejects.toThrow()

    expect(patientBuilder.where).not.toHaveBeenCalled()
    expect(clinicalNotesBuilder.where).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // CT-54-03: Isolamento de tenant — appointment de outro tenant → 404
  // -------------------------------------------------------------------------

  it('CT-54-03: should return 404 when appointment belongs to another tenant', async () => {
    // Mock retorna undefined quando WHERE inclui tenant_id do tenant errado
    // (simulado retornando null do .first() — o banco filtra pelo WHERE)
    const { knex } = createMockKnex({ appointment: null })
    mockKnex.mockImplementation(knex)

    await expect(service.getAppointmentDetail(OTHER_TENANT_ID, APPOINTMENT_ID)).rejects.toThrow(
      'Consulta não encontrada',
    )
  })

  it('CT-54-03b: should always scope appointment query with tenant_id', async () => {
    const { knex, appointmentBuilder } = createMockKnex({})
    mockKnex.mockImplementation(knex)

    await service.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)

    // WHERE deve incluir tenant_id — nunca aceitar appointment de outro tenant
    expect(appointmentBuilder.where).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: TENANT_ID }),
    )
  })

  // -------------------------------------------------------------------------
  // CT-54-04: Sem notas clínicas — clinicalNotes retorna []
  // -------------------------------------------------------------------------

  it('CT-54-04: should return empty clinicalNotes array when no notes exist', async () => {
    const { knex } = createMockKnex({ clinicalNotes: [] })
    mockKnex.mockImplementation(knex)

    const result = await service.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)

    expect(result.clinicalNotes).toEqual([])
    expect(result.appointment).toBeDefined()
    expect(result.patient).toBeDefined()
  })
})
