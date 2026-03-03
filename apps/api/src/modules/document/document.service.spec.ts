/**
 * US-6.3 — Upload de documento para paciente (DocumentService)
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder encadeável do Knex
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - knex.transaction(): mockado para invocar o callback com um mock de `trx` por tabela
 *  - Isolamento de tenant: WHERE { id, tenant_id } sempre aplicado em patients
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
import { DocumentService } from './document.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-1'
const PATIENT_ID = 'patient-uuid-1'
const APPOINTMENT_ID = 'appt-uuid-1'
const ACTOR_ID = 'doctor-uuid-1'
const DOCUMENT_ID = 'doc-uuid-1'

const makeCreatedDocument = (overrides: Record<string, unknown> = {}) => ({
  id: DOCUMENT_ID,
  patient_id: PATIENT_ID,
  appointment_id: APPOINTMENT_ID,
  type: 'prescription',
  file_url: '/uploads/tenant-uuid-1/receita.pdf',
  file_name: 'receita.pdf',
  description: null,
  created_at: new Date('2026-03-02T10:00:00Z'),
  ...overrides,
})

const DEFAULT_DTO = {
  patientId: PATIENT_ID,
  appointmentId: APPOINTMENT_ID,
  type: 'prescription' as const,
  fileUrl: '/uploads/tenant-uuid-1/receita.pdf',
  fileName: 'receita.pdf',
}

// ---------------------------------------------------------------------------
// Mock Knex factory (transaction-based)
// ---------------------------------------------------------------------------

/**
 * Cria um mock de `trx` que roteia chamadas por nome de tabela.
 * Cada tabela tem seu próprio builder com respostas configuráveis.
 */
const createMockTrx = (options: {
  patient?: { id: string } | null
  insertedDocument?: Record<string, unknown>
}) => {
  const {
    patient = { id: PATIENT_ID },
    insertedDocument = makeCreatedDocument(),
  } = options

  // Builder para tabela patients (select .first())
  const patientBuilder = {
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(patient),
  }

  // Builder para insert de documents (insert + returning)
  const mockReturning = jest.fn().mockResolvedValue([insertedDocument])
  const documentInsertBuilder = {
    insert: jest.fn().mockReturnThis(),
    returning: mockReturning,
  }

  // Builder para insert de event_log
  const eventLogBuilder = {
    insert: jest.fn().mockResolvedValue([{ id: 'event-uuid-1' }]),
  }

  const trx = jest.fn().mockImplementation((table: string) => {
    if (table === 'patients') return patientBuilder
    if (table === 'documents') return documentInsertBuilder
    if (table === 'event_log') return eventLogBuilder
    throw new Error(`Tabela inesperada no mock: ${table}`)
  })

  return { trx, patientBuilder, documentInsertBuilder, eventLogBuilder }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DocumentService — createDocument', () => {
  let service: DocumentService
  let mockKnex: jest.Mock & { transaction: jest.Mock }

  beforeEach(async () => {
    const transactionMock = jest.fn()
    mockKnex = Object.assign(jest.fn(), {
      transaction: transactionMock,
    }) as jest.Mock & { transaction: jest.Mock }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: KNEX, useValue: mockKnex },
      ],
    }).compile()

    service = moduleRef.get<DocumentService>(DocumentService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // CT-63-01: Happy path — documento criado com sucesso
  // -------------------------------------------------------------------------

  it('CT-63-01: should create and return the document on success', async () => {
    const { trx } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const result = await service.createDocument(TENANT_ID, ACTOR_ID, DEFAULT_DTO)

    expect(result).toMatchObject({
      id: DOCUMENT_ID,
      patient_id: PATIENT_ID,
      appointment_id: APPOINTMENT_ID,
      type: 'prescription',
      file_url: DEFAULT_DTO.fileUrl,
      file_name: DEFAULT_DTO.fileName,
    })
  })

  it('CT-63-01b: should insert document with correct fields', async () => {
    const { trx, documentInsertBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.createDocument(TENANT_ID, ACTOR_ID, DEFAULT_DTO)

    expect(documentInsertBuilder.insert).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      patient_id: PATIENT_ID,
      appointment_id: APPOINTMENT_ID,
      type: 'prescription',
      file_url: DEFAULT_DTO.fileUrl,
      file_name: DEFAULT_DTO.fileName,
      description: null,
    })
  })

  it('CT-63-01c: should validate patient with tenant isolation', async () => {
    const { trx, patientBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.createDocument(TENANT_ID, ACTOR_ID, DEFAULT_DTO)

    expect(patientBuilder.where).toHaveBeenCalledWith({
      id: PATIENT_ID,
      tenant_id: TENANT_ID,
    })
  })

  // -------------------------------------------------------------------------
  // CT-63-02: Isolamento de tenant — paciente de outro tenant → 404
  // -------------------------------------------------------------------------

  it('CT-63-02: should throw NotFoundException when patient does not exist in tenant', async () => {
    const { trx } = createMockTrx({ patient: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createDocument(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow(NotFoundException)
  })

  it('CT-63-02b: should throw with correct message when patient not found', async () => {
    const { trx } = createMockTrx({ patient: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createDocument(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow('Paciente não encontrado')
  })

  it('CT-63-02c: should not insert document when patient is not found', async () => {
    const { trx, documentInsertBuilder } = createMockTrx({ patient: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createDocument(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow(NotFoundException)

    expect(documentInsertBuilder.insert).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // CT-63-05: appointmentId omitido → cria com appointment_id null
  // -------------------------------------------------------------------------

  it('CT-63-05: should create document with appointment_id null when appointmentId is omitted', async () => {
    const dtoWithoutAppointment = {
      patientId: PATIENT_ID,
      type: 'exam' as const,
      fileUrl: '/uploads/tenant-uuid-1/exame.pdf',
      fileName: 'exame.pdf',
    }

    const insertedDoc = makeCreatedDocument({
      appointment_id: null,
      type: 'exam',
      file_url: '/uploads/tenant-uuid-1/exame.pdf',
      file_name: 'exame.pdf',
    })

    const { trx, documentInsertBuilder } = createMockTrx({ insertedDocument: insertedDoc })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const result = await service.createDocument(TENANT_ID, ACTOR_ID, dtoWithoutAppointment)

    expect(documentInsertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ appointment_id: null }),
    )
    expect(result).toMatchObject({ appointment_id: null })
  })

  // -------------------------------------------------------------------------
  // Event log — audit trail
  // -------------------------------------------------------------------------

  it('should insert event_log with correct fields on success', async () => {
    const { trx, eventLogBuilder } = createMockTrx({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await service.createDocument(TENANT_ID, ACTOR_ID, DEFAULT_DTO)

    expect(eventLogBuilder.insert).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      event_type: 'document.uploaded',
      actor_type: 'doctor',
      actor_id: ACTOR_ID,
      payload: {
        documentId: DOCUMENT_ID,
        patientId: PATIENT_ID,
        type: 'prescription',
      },
    })
  })

  it('CT-63-01d: should persist description when provided', async () => {
    const dtoWithDescription = { ...DEFAULT_DTO, description: 'Receita ibuprofeno 600mg' }
    const docWithDescription = makeCreatedDocument({ description: 'Receita ibuprofeno 600mg' })
    const { trx, documentInsertBuilder } = createMockTrx({ insertedDocument: docWithDescription })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    const result = await service.createDocument(TENANT_ID, ACTOR_ID, dtoWithDescription)

    expect(documentInsertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Receita ibuprofeno 600mg' }),
    )
    expect(result).toMatchObject({ description: 'Receita ibuprofeno 600mg' })
  })

  it('should not insert event_log when patient is not found', async () => {
    const { trx, eventLogBuilder } = createMockTrx({ patient: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKnex.transaction.mockImplementation((cb: (t: any) => unknown) => cb(trx))

    await expect(
      service.createDocument(TENANT_ID, ACTOR_ID, DEFAULT_DTO),
    ).rejects.toThrow(NotFoundException)

    expect(eventLogBuilder.insert).not.toHaveBeenCalled()
  })
})
