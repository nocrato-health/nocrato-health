/**
 * US-6.1 — Criar nota clínica (ClinicalNoteService)
 * US-6.2 — Listar notas clínicas (ClinicalNoteService)
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder encadeável do Knex
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - knex.transaction(): mockado para invocar o callback com um mock de `trx` por tabela
 *  - Isolamento de tenant: WHERE { id, tenant_id } sempre aplicado
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
import { NotFoundException } from '@nestjs/common'
import { ClinicalNoteService } from './clinical-note.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-1'
const PATIENT_ID = 'patient-uuid-1'
const APPOINTMENT_ID = 'appt-uuid-1'
const ACTOR_ID = 'doctor-uuid-1'
const NOTE_ID = 'note-uuid-1'

const makeCreatedNote = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  appointment_id: APPOINTMENT_ID,
  patient_id: PATIENT_ID,
  content: 'Paciente apresentou melhora significativa.',
  created_at: new Date('2026-03-02T10:00:00Z'),
  ...overrides,
})

const DEFAULT_DTO = {
  appointmentId: APPOINTMENT_ID,
  patientId: PATIENT_ID,
  content: 'Paciente apresentou melhora significativa.',
}

// ---------------------------------------------------------------------------
// Mock Knex factory (transaction-based)
// ---------------------------------------------------------------------------

/**
 * Cria um mock de `trx` que roteia chamadas por nome de tabela.
 * Cada tabela tem seu próprio builder com respostas configuráveis.
 */
const createMockTrx = (options: {
  appointment?: { id: string } | null
  patient?: { id: string } | null
  insertedNote?: Record<string, unknown>
}) => {
  const {
    appointment = { id: APPOINTMENT_ID },
    patient = { id: PATIENT_ID },
    insertedNote = makeCreatedNote(),
  } = options

  // Builder para tabela appointments (select .first())
  const appointmentBuilder = {
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(appointment),
  }

  // Builder para tabela patients (select .first())
  const patientBuilder = {
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(patient),
  }

  // Builder para insert de clinical_notes (insert + returning)
  const mockReturning = jest.fn().mockResolvedValue([insertedNote])
  const noteInsertBuilder = {
    insert: jest.fn().mockReturnThis(),
    returning: mockReturning,
  }

  // Builder para insert de event_log
  const eventLogBuilder = {
    insert: jest.fn().mockResolvedValue([{ id: 'event-uuid-1' }]),
  }

  const trx = jest.fn().mockImplementation((table: string) => {
    if (table === 'appointments') return appointmentBuilder
    if (table === 'patients') return patientBuilder
    if (table === 'clinical_notes') return noteInsertBuilder
    if (table === 'event_log') return eventLogBuilder
    throw new Error(`Tabela inesperada no mock: ${table}`)
  })

  return { trx, appointmentBuilder, patientBuilder, noteInsertBuilder, eventLogBuilder }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ClinicalNoteService — createClinicalNote', () => {
  let service: ClinicalNoteService
  let mockKnex: jest.Mock & { transaction: jest.Mock; fn: { now: jest.Mock } }

  beforeEach(async () => {
    const transactionMock = jest.fn()
    mockKnex = Object.assign(jest.fn(), {
      transaction: transactionMock,
      fn: { now: jest.fn().mockReturnValue('now()') },
    }) as jest.Mock & { transaction: jest.Mock; fn: { now: jest.Mock } }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicalNoteService,
        { provide: KNEX, useValue: mockKnex },
      ],
    }).compile()

    service = moduleRef.get<ClinicalNoteService>(ClinicalNoteService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // CT-61-01: Happy path — nota criada com sucesso
  // -------------------------------------------------------------------------

  it('CT-61-01: should create and return the clinical note on success', async () => {
    const { trx } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const result = await service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO)

    expect(result).toMatchObject({
      id: NOTE_ID,
      appointment_id: APPOINTMENT_ID,
      patient_id: PATIENT_ID,
      content: DEFAULT_DTO.content,
    })
  })

  it('CT-61-01b: should insert clinical note with correct fields', async () => {
    const { trx, noteInsertBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO)

    expect(noteInsertBuilder.insert).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      appointment_id: APPOINTMENT_ID,
      patient_id: PATIENT_ID,
      content: DEFAULT_DTO.content,
    })
  })

  it('CT-61-01c: should validate appointment with tenant isolation', async () => {
    const { trx, appointmentBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO)

    expect(appointmentBuilder.where).toHaveBeenCalledWith({
      id: APPOINTMENT_ID,
      tenant_id: TENANT_ID,
    })
  })

  it('CT-61-01d: should validate patient with tenant isolation', async () => {
    const { trx, patientBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO)

    expect(patientBuilder.where).toHaveBeenCalledWith({
      id: PATIENT_ID,
      tenant_id: TENANT_ID,
    })
  })

  // -------------------------------------------------------------------------
  // CT-61-02: Appointment não encontrado → 404
  // -------------------------------------------------------------------------

  it('CT-61-02: should throw NotFoundException when appointment does not exist in tenant', async () => {
    const { trx } = createMockTrx({ appointment: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow(NotFoundException)
  })

  it('CT-61-02b: should throw with correct message when appointment not found', async () => {
    const { trx } = createMockTrx({ appointment: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow('Consulta não encontrada')
  })

  // -------------------------------------------------------------------------
  // CT-61-03: Paciente não encontrado → 404
  // -------------------------------------------------------------------------

  it('CT-61-03: should throw NotFoundException when patient does not exist in tenant', async () => {
    const { trx } = createMockTrx({ patient: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow(NotFoundException)
  })

  it('CT-61-03b: should throw with correct message when patient not found', async () => {
    const { trx } = createMockTrx({ patient: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow('Paciente não encontrado')
  })

  // -------------------------------------------------------------------------
  // CT-61-04: Event log inserido corretamente no happy path
  // -------------------------------------------------------------------------

  it('CT-61-04: should insert event_log with correct fields on success', async () => {
    const { trx, eventLogBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO)

    expect(eventLogBuilder.insert).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      event_type: 'note.created',
      actor_type: 'doctor',
      actor_id: ACTOR_ID,
      payload: {
        noteId: NOTE_ID,
        appointmentId: APPOINTMENT_ID,
        patientId: PATIENT_ID,
      },
    })
  })

  it('CT-61-04b: should not insert event_log when appointment is not found', async () => {
    const { trx, eventLogBuilder } = createMockTrx({ appointment: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow(NotFoundException)

    expect(eventLogBuilder.insert).not.toHaveBeenCalled()
  })

  it('CT-61-04c: should not insert event_log when patient is not found', async () => {
    const { trx, eventLogBuilder } = createMockTrx({ patient: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createClinicalNote(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow(NotFoundException)

    expect(eventLogBuilder.insert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Suite — listClinicalNotes (US-6.2)
// ---------------------------------------------------------------------------

/**
 * Estratégia de mock para listClinicalNotes:
 *
 * O método usa o seguinte padrão Knex:
 *   const builder = this.knex('clinical_notes').where(...)   ← builder principal
 *   builder.where(...)                                        ← filtro condicional (mutação in-place)
 *   const countResult = await builder.clone().count().first() ← clone separado para count
 *   const data = await builder.select().orderBy().offset().limit() ← query de dados
 *
 * Para simular corretamente, o builder principal precisa ter:
 *  - .where() retornando this (mutação in-place)
 *  - .clone() retornando um builder de count separado
 *  - .select() / .orderBy() / .offset() / .limit() retornando Promise com array de dados
 *
 * O builder de count (retornado pelo clone) precisa ter:
 *  - .count() retornando this
 *  - .first() retornando Promise com { count: 'N' }
 *
 * Separação entre count e data: clone retorna um objeto diferente do builder principal,
 * evitando que .limit() do builder de dados afete o count.
 */

const makeNote = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  appointment_id: APPOINTMENT_ID,
  patient_id: PATIENT_ID,
  content: 'Paciente apresentou melhora significativa.',
  created_at: new Date('2026-03-02T10:00:00Z'),
  ...overrides,
})

/**
 * Cria um mock de builder Knex para listClinicalNotes.
 * countValue: string retornada pelo PostgreSQL COUNT (ex: '2')
 * dataRows: array de notas retornadas pela query de dados
 */
const createListBuilder = (options: {
  countValue?: string
  dataRows?: Record<string, unknown>[]
}) => {
  const { countValue = '0', dataRows = [] } = options

  // Builder de count — retornado por .clone()
  const mockFirst = jest.fn().mockResolvedValue({ count: countValue })
  const mockCount = jest.fn().mockReturnThis()
  const countBuilder = {
    count: mockCount,
    first: mockFirst,
  }

  // Builder principal — retornado por this.knex('clinical_notes')
  // .limit() é o terminal final da query de dados — resolve com array
  const mockLimit = jest.fn().mockResolvedValue(dataRows)
  const mockOffset = jest.fn().mockReturnThis()
  const mockOrderBy = jest.fn().mockReturnThis()
  const mockSelect = jest.fn().mockReturnThis()
  const mockClone = jest.fn().mockReturnValue(countBuilder)
  const mockWhere = jest.fn().mockReturnThis()

  const mainBuilder = {
    where: mockWhere,
    clone: mockClone,
    select: mockSelect,
    orderBy: mockOrderBy,
    offset: mockOffset,
    limit: mockLimit,
  }

  return { mainBuilder, countBuilder, mockWhere, mockClone, mockCount, mockFirst, mockSelect, mockOrderBy, mockOffset, mockLimit }
}

describe('ClinicalNoteService — listClinicalNotes', () => {
  let service: ClinicalNoteService
  let mockKnex: jest.Mock & { transaction: jest.Mock; fn: { now: jest.Mock } }

  beforeEach(async () => {
    const transactionMock = jest.fn()
    mockKnex = Object.assign(jest.fn(), {
      transaction: transactionMock,
      fn: { now: jest.fn().mockReturnValue('now()') },
    }) as jest.Mock & { transaction: jest.Mock; fn: { now: jest.Mock } }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicalNoteService,
        { provide: KNEX, useValue: mockKnex },
      ],
    }).compile()

    service = moduleRef.get<ClinicalNoteService>(ClinicalNoteService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // CT-62-01: Happy path — listar por appointmentId
  // -------------------------------------------------------------------------

  it('CT-62-01: should return paginated notes filtered by appointmentId', async () => {
    const notes = [makeNote()]
    const { mainBuilder } = createListBuilder({ countValue: '1', dataRows: notes })
    mockKnex.mockReturnValue(mainBuilder)

    const query = { appointmentId: APPOINTMENT_ID, page: 1, limit: 10 }
    const result = await service.listClinicalNotes(TENANT_ID, query)

    expect(result).toMatchObject({
      data: notes,
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    })
  })

  it('CT-62-01b: should apply where with appointmentId when present', async () => {
    const { mainBuilder, mockWhere } = createListBuilder({ countValue: '1', dataRows: [makeNote()] })
    mockKnex.mockReturnValue(mainBuilder)

    const query = { appointmentId: APPOINTMENT_ID, page: 1, limit: 10 }
    await service.listClinicalNotes(TENANT_ID, query)

    // Primeira chamada: WHERE { tenant_id }; segunda: WHERE { appointment_id }
    expect(mockWhere).toHaveBeenCalledWith({ tenant_id: TENANT_ID })
    expect(mockWhere).toHaveBeenCalledWith({ appointment_id: APPOINTMENT_ID })
  })

  // -------------------------------------------------------------------------
  // CT-62-02: Happy path — listar por patientId com paginação
  // -------------------------------------------------------------------------

  it('CT-62-02: should return paginated notes filtered by patientId', async () => {
    const notes = [makeNote(), makeNote({ id: 'note-uuid-2' })]
    const { mainBuilder } = createListBuilder({ countValue: '2', dataRows: notes })
    mockKnex.mockReturnValue(mainBuilder)

    const query = { patientId: PATIENT_ID, page: 1, limit: 10 }
    const result = await service.listClinicalNotes(TENANT_ID, query)

    expect(result.data).toHaveLength(2)
    expect(result.pagination).toMatchObject({ page: 1, limit: 10, total: 2, totalPages: 1 })
  })

  it('CT-62-02b: should apply where with patientId when appointmentId is absent', async () => {
    const { mainBuilder, mockWhere } = createListBuilder({ countValue: '1', dataRows: [makeNote()] })
    mockKnex.mockReturnValue(mainBuilder)

    const query = { patientId: PATIENT_ID, page: 1, limit: 10 }
    await service.listClinicalNotes(TENANT_ID, query)

    expect(mockWhere).toHaveBeenCalledWith({ tenant_id: TENANT_ID })
    expect(mockWhere).toHaveBeenCalledWith({ patient_id: PATIENT_ID })
  })

  // -------------------------------------------------------------------------
  // CT-62-03: Lista vazia — sem notas para o filtro
  // -------------------------------------------------------------------------

  it('CT-62-03: should return empty data array when no notes exist', async () => {
    const { mainBuilder } = createListBuilder({ countValue: '0', dataRows: [] })
    mockKnex.mockReturnValue(mainBuilder)

    const query = { appointmentId: APPOINTMENT_ID, page: 1, limit: 10 }
    const result = await service.listClinicalNotes(TENANT_ID, query)

    expect(result.data).toHaveLength(0)
    expect(result.pagination).toMatchObject({ total: 0, totalPages: 0 })
  })

  // -------------------------------------------------------------------------
  // CT-62-04: Isolamento de tenant — retorna vazio sem lançar exceção
  // -------------------------------------------------------------------------

  it('CT-62-04: should return empty data without throwing when appointmentId belongs to another tenant', async () => {
    // Isolamento garantido pelo WHERE tenant_id — o banco retorna 0 rows naturalmente
    const { mainBuilder } = createListBuilder({ countValue: '0', dataRows: [] })
    mockKnex.mockReturnValue(mainBuilder)

    const query = { appointmentId: 'foreign-appt-uuid', page: 1, limit: 10 }
    const result = await service.listClinicalNotes(TENANT_ID, query)

    expect(result.data).toHaveLength(0)
    expect(result.pagination.total).toBe(0)
    // WHERE tenant_id sempre aplicado — nunca lança NotFoundException
    expect(mockKnex).toHaveBeenCalledWith('clinical_notes')
  })

  // -------------------------------------------------------------------------
  // CT-62-05: Paginação — totalPages calculado corretamente
  // -------------------------------------------------------------------------

  it('CT-62-05: should calculate totalPages correctly with multiple pages', async () => {
    const { mainBuilder } = createListBuilder({ countValue: '25', dataRows: [] })
    mockKnex.mockReturnValue(mainBuilder)

    const query = { patientId: PATIENT_ID, page: 2, limit: 10 }
    const result = await service.listClinicalNotes(TENANT_ID, query)

    expect(result.pagination).toMatchObject({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3, // Math.ceil(25 / 10) = 3
    })
  })

  it('CT-62-05b: should apply correct offset for pagination', async () => {
    const { mainBuilder, mockOffset, mockLimit } = createListBuilder({ countValue: '25', dataRows: [] })
    mockKnex.mockReturnValue(mainBuilder)

    const query = { patientId: PATIENT_ID, page: 3, limit: 10 }
    await service.listClinicalNotes(TENANT_ID, query)

    // page=3, limit=10 → offset=(3-1)*10=20
    expect(mockOffset).toHaveBeenCalledWith(20)
    expect(mockLimit).toHaveBeenCalledWith(10)
  })

  // -------------------------------------------------------------------------
  // CT-62-06: clone() usado para isolamento do count
  // -------------------------------------------------------------------------

  it('CT-62-06: should use clone() before count to avoid contaminating data query', async () => {
    const { mainBuilder, mockClone } = createListBuilder({ countValue: '5', dataRows: [] })
    mockKnex.mockReturnValue(mainBuilder)

    const query = { appointmentId: APPOINTMENT_ID, page: 1, limit: 10 }
    await service.listClinicalNotes(TENANT_ID, query)

    expect(mockClone).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // CT-62-07: appointmentId tem precedência quando ambos são enviados
  // -------------------------------------------------------------------------

  it('CT-62-07: should use appointmentId filter and ignore patientId when both are provided', async () => {
    const { mainBuilder, mockWhere } = createListBuilder({ countValue: '1', dataRows: [makeNote()] })
    mockKnex.mockReturnValue(mainBuilder)

    // Ambos os filtros enviados simultaneamente
    const query = { appointmentId: APPOINTMENT_ID, patientId: PATIENT_ID, page: 1, limit: 10 }
    await service.listClinicalNotes(TENANT_ID, query)

    // appointment_id deve estar no WHERE
    expect(mockWhere).toHaveBeenCalledWith({ appointment_id: APPOINTMENT_ID })
    // patient_id NÃO deve estar no WHERE (appointmentId tem precedência)
    expect(mockWhere).not.toHaveBeenCalledWith({ patient_id: PATIENT_ID })
  })
})
