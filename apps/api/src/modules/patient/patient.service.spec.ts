/**
 * US-4.1 — Listagem paginada de pacientes (PatientService)
 * US-4.2 — Perfil completo do paciente (PatientService)
 * US-4.3 — Criar paciente manualmente (PatientService)
 * US-4.4 — Editar paciente parcialmente (PatientService)
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder encadeável do Knex
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - Knex.count() retorna string do PostgreSQL — verificamos que o service converte com Number()
 *  - cpf e portal_access_code NÃO devem aparecer na resposta (campos sensíveis)
 *  - US-4.2: mockKnex como jest.fn() que diferencia por tabela via mockImplementation
 *  - US-4.3: insert com returning — mockInsert + mockReturning encadeados
 *  - US-4.4: mockKnex diferencia select (verificar existência) de update por tabela + operação
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
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PatientService } from './patient.service'
import { EventLogService } from '@/modules/event-log/event-log.service'
import { KNEX } from '@/database/knex.provider'

const mockEventEmitter = { emit: jest.fn() }
const mockEventLogService = { append: jest.fn().mockResolvedValue(undefined) }

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-1'

const makePatient = (overrides: Record<string, unknown> = {}) => ({
  id: 'patient-uuid-1',
  name: 'Maria Silva',
  phone: '11999990000',
  email: 'maria@example.com',
  source: 'manual',
  status: 'active',
  created_at: new Date('2024-01-15T10:00:00Z'),
  ...overrides,
})

// ---------------------------------------------------------------------------
// Mock Knex encadeável
// ---------------------------------------------------------------------------

// Cada teste pode sobrescrever os valores retornados pelos mocks de terminal
// chamando mockResolvedValue() dentro do bloco it().
const mockQueryBuilder = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  clone: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue({ count: '3' }),
}

const mockKnex = jest.fn().mockReturnValue(mockQueryBuilder)

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PatientService', () => {
  let service: PatientService

  beforeEach(async () => {
    // Limpar mocks entre testes para evitar contaminação de estado
    jest.clearAllMocks()

    // Restaurar comportamentos padrão após clearAllMocks
    mockQueryBuilder.where.mockReturnThis()
    mockQueryBuilder.andWhere.mockReturnThis()
    mockQueryBuilder.clone.mockReturnThis()
    mockQueryBuilder.count.mockReturnThis()
    mockQueryBuilder.select.mockReturnThis()
    mockQueryBuilder.limit.mockReturnThis()
    mockQueryBuilder.offset.mockReturnThis()
    mockQueryBuilder.orderBy.mockReturnThis()
    mockQueryBuilder.first.mockResolvedValue({ count: '3' })
    // offset é terminal — retorna os dados
    mockQueryBuilder.offset.mockResolvedValue([makePatient()])
    mockKnex.mockReturnValue(mockQueryBuilder)

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        { provide: KNEX, useValue: mockKnex },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EventLogService, useValue: mockEventLogService },
      ],
    }).compile()

    service = moduleRef.get<PatientService>(PatientService)
  })

  // -------------------------------------------------------------------------
  // Listagem sem filtros
  // -------------------------------------------------------------------------

  describe('listPatients — sem filtros', () => {
    it('should return paginated list with default pagination', async () => {
      const patients = [makePatient(), makePatient({ id: 'patient-uuid-2', name: 'João Costa' })]
      mockQueryBuilder.first.mockResolvedValue({ count: '2' })
      mockQueryBuilder.offset.mockResolvedValue(patients)

      const result = await service.listPatients(TENANT_ID, { page: 1, limit: 20 })

      expect(result.data).toEqual(patients)
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      })
    })

    it('should scope query to tenant_id', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20 })

      expect(mockKnex).toHaveBeenCalledWith('patients')
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ tenant_id: TENANT_ID })
    })

    it('should not call andWhere when no search or status filter provided', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20 })

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Busca por nome
  // -------------------------------------------------------------------------

  describe('listPatients — busca por nome (ilike)', () => {
    it('should apply andWhere with ilike on name when search is provided', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20, search: 'Maria' })

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(1)
      // andWhere recebe uma função de callback — verificamos que foi chamado
      const [callbackArg] = mockQueryBuilder.andWhere.mock.calls[0]
      expect(typeof callbackArg).toBe('function')
    })

    it('should use ilike pattern with wildcards for search', async () => {
      // Captura o callback passado ao andWhere para inspecionar as sub-queries
      const mockQb = {
        whereILike: jest.fn().mockReturnThis(),
        orWhereILike: jest.fn().mockReturnThis(),
      }
      mockQueryBuilder.andWhere.mockImplementation((cb: (qb: typeof mockQb) => void) => {
        cb(mockQb)
        return mockQueryBuilder
      })
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20, search: 'Maria' })

      expect(mockQb.whereILike).toHaveBeenCalledWith('name', '%Maria%')
      expect(mockQb.orWhereILike).toHaveBeenCalledWith('phone', '%Maria%')
    })
  })

  // -------------------------------------------------------------------------
  // Busca por telefone
  // -------------------------------------------------------------------------

  describe('listPatients — busca por telefone (ilike)', () => {
    it('should search phone using ilike with wildcards', async () => {
      const mockQb = {
        whereILike: jest.fn().mockReturnThis(),
        orWhereILike: jest.fn().mockReturnThis(),
      }
      mockQueryBuilder.andWhere.mockImplementation((cb: (qb: typeof mockQb) => void) => {
        cb(mockQb)
        return mockQueryBuilder
      })
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20, search: '11999' })

      expect(mockQb.orWhereILike).toHaveBeenCalledWith('phone', '%11999%')
    })
  })

  // -------------------------------------------------------------------------
  // Sanitização de caracteres especiais no search
  // -------------------------------------------------------------------------

  describe('listPatients — sanitização de search', () => {
    it('should escape % in search to prevent wildcard bypass', async () => {
      const mockQb = {
        whereILike: jest.fn().mockReturnThis(),
        orWhereILike: jest.fn().mockReturnThis(),
      }
      mockQueryBuilder.andWhere.mockImplementation((cb: (qb: typeof mockQb) => void) => {
        cb(mockQb)
        return mockQueryBuilder
      })
      mockQueryBuilder.first.mockResolvedValue({ count: '0' })
      mockQueryBuilder.offset.mockResolvedValue([])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20, search: '%' })

      expect(mockQb.whereILike).toHaveBeenCalledWith('name', String.raw`%\%%`)
      expect(mockQb.orWhereILike).toHaveBeenCalledWith('phone', String.raw`%\%%`)
    })

    it('should escape _ in search to prevent single-char wildcard', async () => {
      const mockQb = {
        whereILike: jest.fn().mockReturnThis(),
        orWhereILike: jest.fn().mockReturnThis(),
      }
      mockQueryBuilder.andWhere.mockImplementation((cb: (qb: typeof mockQb) => void) => {
        cb(mockQb)
        return mockQueryBuilder
      })
      mockQueryBuilder.first.mockResolvedValue({ count: '0' })
      mockQueryBuilder.offset.mockResolvedValue([])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20, search: 'Maria_Silva' })

      expect(mockQb.whereILike).toHaveBeenCalledWith('name', String.raw`%Maria\_Silva%`)
    })
  })

  // -------------------------------------------------------------------------
  // Filtro por status
  // -------------------------------------------------------------------------

  describe('listPatients — filtro por status active', () => {
    it('should apply andWhere status filter when status=active', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient({ status: 'active' })])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20, status: 'active' })

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith({ status: 'active' })
    })
  })

  describe('listPatients — filtro por status inactive', () => {
    it('should apply andWhere status filter when status=inactive', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient({ status: 'inactive' })])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20, status: 'inactive' })

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith({ status: 'inactive' })
    })
  })

  // -------------------------------------------------------------------------
  // Busca + filtro combinados
  // -------------------------------------------------------------------------

  describe('listPatients — busca + filtro combinados', () => {
    it('should apply both search and status filters together', async () => {
      const mockQb = {
        whereILike: jest.fn().mockReturnThis(),
        orWhereILike: jest.fn().mockReturnThis(),
      }
      mockQueryBuilder.andWhere.mockImplementation((arg: unknown) => {
        if (typeof arg === 'function') {
          ;(arg as (qb: typeof mockQb) => void)(mockQb)
        }
        return mockQueryBuilder
      })
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, {
        page: 1,
        limit: 20,
        search: 'Maria',
        status: 'active',
      })

      // andWhere deve ter sido chamado 2 vezes: uma para search, uma para status
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(2)
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith({ status: 'active' })
      expect(mockQb.whereILike).toHaveBeenCalledWith('name', '%Maria%')
    })
  })

  // -------------------------------------------------------------------------
  // Paginação — página 2
  // -------------------------------------------------------------------------

  describe('listPatients — página 2', () => {
    it('should calculate correct offset for page 2', async () => {
      const page = 2
      const limit = 10
      const expectedOffset = (page - 1) * limit // 10

      mockQueryBuilder.first.mockResolvedValue({ count: '25' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page, limit })

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10)
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(expectedOffset)
    })

    it('should return correct pagination metadata for page 2 with 25 total', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '25' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      const result = await service.listPatients(TENANT_ID, { page: 2, limit: 10 })

      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      })
    })
  })

  // -------------------------------------------------------------------------
  // Lista vazia
  // -------------------------------------------------------------------------

  describe('listPatients — lista vazia', () => {
    it('should return empty data array and total 0 when no patients found', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '0' })
      mockQueryBuilder.offset.mockResolvedValue([])

      const result = await service.listPatients(TENANT_ID, { page: 1, limit: 20 })

      expect(result.data).toEqual([])
      expect(result.pagination.total).toBe(0)
      expect(result.pagination.totalPages).toBe(0)
    })

    it('should handle null countResult gracefully', async () => {
      mockQueryBuilder.first.mockResolvedValue(null)
      mockQueryBuilder.offset.mockResolvedValue([])

      const result = await service.listPatients(TENANT_ID, { page: 1, limit: 20 })

      expect(result.pagination.total).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Segurança — campos sensíveis não expostos
  // -------------------------------------------------------------------------

  describe('listPatients — campos sensíveis', () => {
    it('should select only public fields — portal_access_code must not be selected', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20 })

      // Verificar que select foi chamado com os campos corretos
      expect(mockQueryBuilder.select).toHaveBeenCalledWith([
        'id',
        'name',
        'phone',
        'email',
        'source',
        'status',
        'created_at',
      ])
    })

    it('should NOT include portal_access_code in selected fields', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20 })

      const selectCall = mockQueryBuilder.select.mock.calls[0][0] as string[]
      expect(selectCall).not.toContain('portal_access_code')
    })

    it('should NOT include cpf in selected fields', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20 })

      const selectCall = mockQueryBuilder.select.mock.calls[0][0] as string[]
      expect(selectCall).not.toContain('cpf')
    })
  })

  // -------------------------------------------------------------------------
  // Ordenação
  // -------------------------------------------------------------------------

  describe('listPatients — ordenação', () => {
    it('should order by created_at descending', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '1' })
      mockQueryBuilder.offset.mockResolvedValue([makePatient()])

      await service.listPatients(TENANT_ID, { page: 1, limit: 20 })

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
    })
  })
})

// =============================================================================
// US-4.2 — getPatientProfile
// =============================================================================

// ---------------------------------------------------------------------------
// Fixtures para US-4.2
// ---------------------------------------------------------------------------

const PATIENT_ID = 'patient-uuid-1'
const OTHER_TENANT_ID = 'other-tenant-uuid'

const makePatientProfile = (overrides: Record<string, unknown> = {}) => ({
  id: PATIENT_ID,
  name: 'Maria Silva',
  phone: '11999990000',
  email: 'maria@example.com',
  source: 'manual',
  status: 'active',
  portal_active: false,
  created_at: new Date('2024-01-15T10:00:00Z'),
  ...overrides,
})

const makeAppointment = (overrides: Record<string, unknown> = {}) => ({
  id: 'appt-uuid-1',
  date_time: new Date('2024-02-10T14:00:00Z'),
  status: 'completed',
  duration_minutes: 60,
  started_at: new Date('2024-02-10T14:05:00Z'),
  completed_at: new Date('2024-02-10T15:00:00Z'),
  ...overrides,
})

const makeClinicalNote = (overrides: Record<string, unknown> = {}) => ({
  id: 'note-uuid-1',
  appointment_id: 'appt-uuid-1',
  content: 'Paciente apresentou melhora.',
  created_at: new Date('2024-02-10T15:10:00Z'),
  ...overrides,
})

const makeDocument = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-uuid-1',
  file_name: 'receita.pdf',
  type: 'prescription',
  file_url: 'https://storage.example.com/receita.pdf',
  mime_type: 'application/pdf',
  created_at: new Date('2024-02-10T15:20:00Z'),
  ...overrides,
})

// ---------------------------------------------------------------------------
// Suite US-4.2
// ---------------------------------------------------------------------------

describe('PatientService — getPatientProfile', () => {
  let service: PatientService

  // Query builder base — reutilizado e reconfigurado por tabela em cada teste
  const makeQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue([]),
    first: jest.fn().mockResolvedValue(null),
  })

  // mockKnex diferencia retornos por tabela via mockImplementation
  let mockKnexProfile: jest.Mock

  beforeEach(async () => {
    jest.clearAllMocks()

    // Por padrão: patient encontrado, listas vazias
    const patientBuilder = makeQueryBuilder()
    patientBuilder.first.mockResolvedValue(makePatientProfile())

    const appointmentsBuilder = makeQueryBuilder()
    appointmentsBuilder.orderBy.mockResolvedValue([])

    const notesBuilder = makeQueryBuilder()
    notesBuilder.orderBy.mockResolvedValue([])

    const documentsBuilder = makeQueryBuilder()
    documentsBuilder.orderBy.mockResolvedValue([])

    mockKnexProfile = jest.fn().mockImplementation((table: string) => {
      if (table === 'patients') return patientBuilder
      if (table === 'appointments') return appointmentsBuilder
      if (table === 'clinical_notes') return notesBuilder
      if (table === 'documents') return documentsBuilder
      return makeQueryBuilder()
    })

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        { provide: KNEX, useValue: mockKnexProfile },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EventLogService, useValue: mockEventLogService },
      ],
    }).compile()

    service = moduleRef.get<PatientService>(PatientService)
  })

  // -------------------------------------------------------------------------
  // Perfil completo
  // -------------------------------------------------------------------------

  describe('getPatientProfile — perfil completo', () => {
    it('should return patient profile with appointments, clinicalNotes and documents', async () => {
      const appt = makeAppointment()
      const note = makeClinicalNote()
      const doc = makeDocument()

      const patientBuilder = makeQueryBuilder()
      patientBuilder.first.mockResolvedValue(makePatientProfile())

      const appointmentsBuilder = makeQueryBuilder()
      appointmentsBuilder.orderBy.mockResolvedValue([appt])

      const notesBuilder = makeQueryBuilder()
      notesBuilder.orderBy.mockResolvedValue([note])

      const documentsBuilder = makeQueryBuilder()
      documentsBuilder.orderBy.mockResolvedValue([doc])

      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') return patientBuilder
        if (table === 'appointments') return appointmentsBuilder
        if (table === 'clinical_notes') return notesBuilder
        if (table === 'documents') return documentsBuilder
        return makeQueryBuilder()
      })

      const result = await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      expect(result.patient).toEqual(makePatientProfile())
      expect(result.appointments).toEqual([appt])
      expect(result.clinicalNotes).toEqual([note])
      expect(result.documents).toEqual([doc])
    })

    it('should scope patient query to tenant_id and patient id', async () => {
      const patientBuilder = makeQueryBuilder()
      patientBuilder.first.mockResolvedValue(makePatientProfile())
      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') return patientBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      expect(mockKnexProfile).toHaveBeenCalledWith('patients')
      expect(patientBuilder.where).toHaveBeenCalledWith({
        id: PATIENT_ID,
        tenant_id: 'tenant-uuid-1',
      })
    })
  })

  // -------------------------------------------------------------------------
  // NotFoundException — patient não encontrado
  // -------------------------------------------------------------------------

  describe('getPatientProfile — patient não encontrado', () => {
    it('should throw NotFoundException when patient does not exist', async () => {
      const patientBuilder = makeQueryBuilder()
      patientBuilder.first.mockResolvedValue(null)
      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') return patientBuilder
        return makeQueryBuilder()
      })

      await expect(
        service.getPatientProfile('tenant-uuid-1', PATIENT_ID),
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException with message "Paciente não encontrado"', async () => {
      const patientBuilder = makeQueryBuilder()
      patientBuilder.first.mockResolvedValue(null)
      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') return patientBuilder
        return makeQueryBuilder()
      })

      await expect(
        service.getPatientProfile('tenant-uuid-1', PATIENT_ID),
      ).rejects.toThrow('Paciente não encontrado')
    })
  })

  // -------------------------------------------------------------------------
  // Isolamento de tenant
  // -------------------------------------------------------------------------

  describe('getPatientProfile — isolamento de tenant', () => {
    it('should throw NotFoundException when patient belongs to a different tenant', async () => {
      // Simula patient retornado null porque where({ id, tenant_id: OTHER_TENANT_ID }) não encontra nada
      const patientBuilder = makeQueryBuilder()
      patientBuilder.first.mockResolvedValue(null)
      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') return patientBuilder
        return makeQueryBuilder()
      })

      await expect(
        service.getPatientProfile(OTHER_TENANT_ID, PATIENT_ID),
      ).rejects.toThrow(NotFoundException)
    })

    it('should scope appointments query to tenant_id', async () => {
      const appointmentsBuilder = makeQueryBuilder()
      appointmentsBuilder.orderBy.mockResolvedValue([makeAppointment()])

      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') {
          const b = makeQueryBuilder()
          b.first.mockResolvedValue(makePatientProfile())
          return b
        }
        if (table === 'appointments') return appointmentsBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      expect(appointmentsBuilder.where).toHaveBeenCalledWith({
        tenant_id: 'tenant-uuid-1',
        patient_id: PATIENT_ID,
      })
    })

    it('should scope clinical_notes query to tenant_id', async () => {
      const notesBuilder = makeQueryBuilder()
      notesBuilder.orderBy.mockResolvedValue([makeClinicalNote()])

      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') {
          const b = makeQueryBuilder()
          b.first.mockResolvedValue(makePatientProfile())
          return b
        }
        if (table === 'clinical_notes') return notesBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      expect(notesBuilder.where).toHaveBeenCalledWith({
        tenant_id: 'tenant-uuid-1',
        patient_id: PATIENT_ID,
      })
    })

    it('should scope documents query to tenant_id', async () => {
      const documentsBuilder = makeQueryBuilder()
      documentsBuilder.orderBy.mockResolvedValue([makeDocument()])

      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') {
          const b = makeQueryBuilder()
          b.first.mockResolvedValue(makePatientProfile())
          return b
        }
        if (table === 'documents') return documentsBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      expect(documentsBuilder.where).toHaveBeenCalledWith({
        tenant_id: 'tenant-uuid-1',
        patient_id: PATIENT_ID,
      })
    })
  })

  // -------------------------------------------------------------------------
  // Listas vazias
  // -------------------------------------------------------------------------

  describe('getPatientProfile — listas vazias', () => {
    it('should return empty arrays when patient has no appointments, notes or documents', async () => {
      // Defaults do beforeEach: listas vazias, patient encontrado
      const result = await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      expect(result.appointments).toEqual([])
      expect(result.clinicalNotes).toEqual([])
      expect(result.documents).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // Ordenação
  // -------------------------------------------------------------------------

  describe('getPatientProfile — ordenação', () => {
    it('should order appointments by date_time DESC', async () => {
      const appointmentsBuilder = makeQueryBuilder()
      appointmentsBuilder.orderBy.mockResolvedValue([])

      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') {
          const b = makeQueryBuilder()
          b.first.mockResolvedValue(makePatientProfile())
          return b
        }
        if (table === 'appointments') return appointmentsBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      expect(appointmentsBuilder.orderBy).toHaveBeenCalledWith('date_time', 'desc')
    })

    it('should order clinical_notes by created_at DESC', async () => {
      const notesBuilder = makeQueryBuilder()
      notesBuilder.orderBy.mockResolvedValue([])

      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') {
          const b = makeQueryBuilder()
          b.first.mockResolvedValue(makePatientProfile())
          return b
        }
        if (table === 'clinical_notes') return notesBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      expect(notesBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
    })

    it('should order documents by created_at DESC', async () => {
      const documentsBuilder = makeQueryBuilder()
      documentsBuilder.orderBy.mockResolvedValue([])

      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') {
          const b = makeQueryBuilder()
          b.first.mockResolvedValue(makePatientProfile())
          return b
        }
        if (table === 'documents') return documentsBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      expect(documentsBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
    })
  })

  // -------------------------------------------------------------------------
  // Campos sensíveis
  // -------------------------------------------------------------------------

  describe('getPatientProfile — campos sensíveis', () => {
    it('should NOT include cpf in patient profile fields', async () => {
      const patientBuilder = makeQueryBuilder()
      patientBuilder.first.mockResolvedValue(makePatientProfile())
      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') return patientBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      const selectCall = patientBuilder.select.mock.calls[0][0] as string[]
      expect(selectCall).not.toContain('cpf')
    })

    it('should NOT include portal_access_code in patient profile fields', async () => {
      const patientBuilder = makeQueryBuilder()
      patientBuilder.first.mockResolvedValue(makePatientProfile())
      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') return patientBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      const selectCall = patientBuilder.select.mock.calls[0][0] as string[]
      expect(selectCall).not.toContain('portal_access_code')
    })

    it('should include portal_active in patient profile fields', async () => {
      const patientBuilder = makeQueryBuilder()
      patientBuilder.first.mockResolvedValue(makePatientProfile())
      mockKnexProfile.mockImplementation((table: string) => {
        if (table === 'patients') return patientBuilder
        return makeQueryBuilder()
      })

      await service.getPatientProfile('tenant-uuid-1', PATIENT_ID)

      const selectCall = patientBuilder.select.mock.calls[0][0] as string[]
      expect(selectCall).toContain('portal_active')
    })
  })
})

// =============================================================================
// US-4.3 — createPatient
// =============================================================================

describe('PatientService — createPatient', () => {
  let service: PatientService

  // Mocks encadeáveis para insert com returning
  let mockReturning: jest.Mock
  let mockInsert: jest.Mock
  let mockKnexCreate: jest.Mock

  const makeCreatedPatient = (overrides: Record<string, unknown> = {}) => ({
    id: 'new-patient-uuid',
    name: 'João Costa',
    phone: '11988880000',
    email: 'joao@example.com',
    source: 'manual',
    status: 'active',
    created_at: new Date('2024-03-01T09:00:00Z'),
    ...overrides,
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    mockReturning = jest.fn().mockResolvedValue([makeCreatedPatient()])
    mockInsert = jest.fn().mockReturnValue({ returning: mockReturning })
    mockKnexCreate = jest.fn().mockReturnValue({ insert: mockInsert })

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        { provide: KNEX, useValue: mockKnexCreate },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EventLogService, useValue: mockEventLogService },
      ],
    }).compile()

    service = moduleRef.get<PatientService>(PatientService)
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('createPatient — happy path', () => {
    it('should insert patient and return created record without sensitive fields', async () => {
      const dto = { name: 'João Costa', phone: '11988880000', email: 'joao@example.com' }
      const result = await service.createPatient('tenant-uuid-1', dto)

      expect(result).toEqual(makeCreatedPatient())
      expect(result).not.toHaveProperty('cpf')
      expect(result).not.toHaveProperty('portal_access_code')
    })

    it('should call knex("patients").insert(...).returning(PUBLIC_PATIENT_FIELDS)', async () => {
      const dto = { name: 'João Costa', phone: '11988880000' }
      await service.createPatient('tenant-uuid-1', dto)

      expect(mockKnexCreate).toHaveBeenCalledWith('patients')
      expect(mockInsert).toHaveBeenCalled()
      expect(mockReturning).toHaveBeenCalledWith([
        'id',
        'name',
        'phone',
        'email',
        'source',
        'status',
        'created_at',
      ])
    })

    it('should return the first element of the returning array', async () => {
      const created = makeCreatedPatient({ name: 'Ana Lima' })
      mockReturning.mockResolvedValue([created])

      const dto = { name: 'Ana Lima', phone: '11977770000' }
      const result = await service.createPatient('tenant-uuid-1', dto)

      expect(result).toBe(created)
    })
  })

  // -------------------------------------------------------------------------
  // source e status são sempre fixos
  // -------------------------------------------------------------------------

  describe('createPatient — source e status fixos', () => {
    it('should always set source to "manual" regardless of dto', async () => {
      const dto = { name: 'Maria', phone: '11966660000' }
      await service.createPatient('tenant-uuid-1', dto)

      const insertedData = mockInsert.mock.calls[0][0] as Record<string, unknown>
      expect(insertedData.source).toBe('manual')
    })

    it('should always set status to "active"', async () => {
      const dto = { name: 'Maria', phone: '11966660000' }
      await service.createPatient('tenant-uuid-1', dto)

      const insertedData = mockInsert.mock.calls[0][0] as Record<string, unknown>
      expect(insertedData.status).toBe('active')
    })
  })

  // -------------------------------------------------------------------------
  // Isolamento de tenant
  // -------------------------------------------------------------------------

  describe('createPatient — isolamento de tenant', () => {
    it('should always use tenantId from JWT — not from dto', async () => {
      const dto = { name: 'Pedro', phone: '11955550000' }
      await service.createPatient('tenant-jwt-uuid', dto)

      const insertedData = mockInsert.mock.calls[0][0] as Record<string, unknown>
      expect(insertedData.tenant_id).toBe('tenant-jwt-uuid')
    })
  })

  // -------------------------------------------------------------------------
  // Campos opcionais
  // -------------------------------------------------------------------------

  describe('createPatient — campos opcionais', () => {
    it('should insert cpf as null when not provided', async () => {
      const dto = { name: 'Carlos', phone: '11944440000' }
      await service.createPatient('tenant-uuid-1', dto)

      const insertedData = mockInsert.mock.calls[0][0] as Record<string, unknown>
      expect(insertedData.cpf).toBeNull()
    })

    it('should insert email as null when not provided', async () => {
      const dto = { name: 'Carlos', phone: '11944440000' }
      await service.createPatient('tenant-uuid-1', dto)

      const insertedData = mockInsert.mock.calls[0][0] as Record<string, unknown>
      expect(insertedData.email).toBeNull()
    })

    it('should insert date_of_birth as null when dateOfBirth not provided', async () => {
      const dto = { name: 'Carlos', phone: '11944440000' }
      await service.createPatient('tenant-uuid-1', dto)

      const insertedData = mockInsert.mock.calls[0][0] as Record<string, unknown>
      expect(insertedData.date_of_birth).toBeNull()
    })

    it('should pass cpf to insert when provided', async () => {
      const dto = { name: 'Carlos', phone: '11944440000', cpf: '123.456.789-00' }
      await service.createPatient('tenant-uuid-1', dto)

      const insertedData = mockInsert.mock.calls[0][0] as Record<string, unknown>
      expect(insertedData.cpf).toBe('123.456.789-00')
    })

    it('should pass email to insert when provided', async () => {
      const dto = { name: 'Carlos', phone: '11944440000', email: 'carlos@example.com' }
      await service.createPatient('tenant-uuid-1', dto)

      const insertedData = mockInsert.mock.calls[0][0] as Record<string, unknown>
      expect(insertedData.email).toBe('carlos@example.com')
    })

    it('should map dateOfBirth to date_of_birth in insert', async () => {
      const dto = { name: 'Carlos', phone: '11944440000', dateOfBirth: '1990-05-15' }
      await service.createPatient('tenant-uuid-1', dto)

      const insertedData = mockInsert.mock.calls[0][0] as Record<string, unknown>
      expect(insertedData.date_of_birth).toBe('1990-05-15')
    })
  })

  // -------------------------------------------------------------------------
  // Conflito de phone — erro 23505
  // -------------------------------------------------------------------------

  describe('createPatient — conflito de telefone', () => {
    it('should throw ConflictException when phone already exists for tenant (error 23505)', async () => {
      const pgUniqueError = Object.assign(new Error('unique violation'), { code: '23505' })
      mockReturning.mockRejectedValue(pgUniqueError)

      const dto = { name: 'Duplicado', phone: '11999990000' }
      await expect(service.createPatient('tenant-uuid-1', dto)).rejects.toThrow(ConflictException)
    })

    it('should throw ConflictException with message "Telefone já cadastrado para outro paciente"', async () => {
      const pgUniqueError = Object.assign(new Error('unique violation'), { code: '23505' })
      mockReturning.mockRejectedValue(pgUniqueError)

      const dto = { name: 'Duplicado', phone: '11999990000' }
      await expect(service.createPatient('tenant-uuid-1', dto)).rejects.toThrow(
        'Telefone já cadastrado para outro paciente',
      )
    })

    it('should re-throw non-unique errors without wrapping', async () => {
      const dbError = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })
      mockReturning.mockRejectedValue(dbError)

      const dto = { name: 'Erro', phone: '11988880000' }
      await expect(service.createPatient('tenant-uuid-1', dto)).rejects.toThrow('connection refused')
      await expect(service.createPatient('tenant-uuid-1', dto)).rejects.not.toThrow(ConflictException)
    })
  })
})

// =============================================================================
// US-4.4 — updatePatient
// =============================================================================

const TENANT_ID_U = 'tenant-uuid-update'
const PATIENT_ID_U = 'patient-uuid-update'

const makeExistingStub = () => ({ id: PATIENT_ID_U })

const makeUpdatedPatient = (overrides: Record<string, unknown> = {}) => ({
  id: PATIENT_ID_U,
  name: 'Maria Silva Atualizada',
  phone: '11999990001',
  email: 'maria.nova@example.com',
  source: 'manual',
  status: 'active',
  created_at: new Date('2024-01-15T10:00:00Z'),
  ...overrides,
})

/**
 * Helpers que constroem os dois builders distintos usados por updatePatient:
 *
 *  1. selectBuilder — primeira chamada a this.knex('patients'):
 *       .where({ id, tenant_id }).select('id').first()  → verifica existência
 *
 *  2. updateBuilder — segunda chamada a this.knex('patients'):
 *       .where({ id, tenant_id }).update(data).returning(fields)  → patch
 */
const makeSelectBuilder = (firstValue: unknown) => {
  const first = jest.fn().mockResolvedValue(firstValue)
  const select = jest.fn().mockReturnValue({ first })
  const where = jest.fn().mockReturnValue({ select, first })
  return { where, select, first }
}

const makeUpdateBuilder = (returningValue: unknown) => {
  const returning = jest.fn().mockResolvedValue(returningValue)
  const update = jest.fn().mockReturnValue({ returning })
  const where = jest.fn().mockReturnValue({ update })
  return { where, update, returning }
}

describe('PatientService — updatePatient', () => {
  let service: PatientService
  let mockKnexUpdate: jest.Mock

  beforeEach(async () => {
    jest.clearAllMocks()

    // Padrão: paciente existe, update retorna o paciente atualizado
    let callCount = 0
    mockKnexUpdate = jest.fn().mockImplementation(() => {
      callCount++
      if (callCount % 2 === 1) {
        return makeSelectBuilder(makeExistingStub())
      }
      return makeUpdateBuilder([makeUpdatedPatient()])
    })
    // this.knex.fn.now() é chamado pelo service para setar updated_at
    ;(mockKnexUpdate as unknown as Record<string, unknown>).fn = { now: jest.fn().mockReturnValue('NOW()') }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        { provide: KNEX, useValue: mockKnexUpdate },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EventLogService, useValue: mockEventLogService },
      ],
    }).compile()

    service = moduleRef.get<PatientService>(PatientService)
  })

  // -------------------------------------------------------------------------
  // Happy path — campo único atualizado
  // -------------------------------------------------------------------------

  describe('updatePatient — happy path (nome)', () => {
    it('should update name and return patient without cpf or portal_access_code', async () => {
      let callCount = 0
      mockKnexUpdate.mockImplementation(() => {
        callCount++
        if (callCount === 1) return makeSelectBuilder(makeExistingStub())
        return makeUpdateBuilder([makeUpdatedPatient({ name: 'Novo Nome' })])
      })

      const result = await service.updatePatient(TENANT_ID_U, PATIENT_ID_U, { name: 'Novo Nome' })

      expect(result).toMatchObject({ name: 'Novo Nome' })
      expect(result).not.toHaveProperty('cpf')
      expect(result).not.toHaveProperty('portal_access_code')
    })
  })

  // -------------------------------------------------------------------------
  // Happy path — patch parcial (só phone)
  // -------------------------------------------------------------------------

  describe('updatePatient — patch parcial (só phone)', () => {
    it('should update only the phone field and return updated patient', async () => {
      let callCount = 0
      mockKnexUpdate.mockImplementation(() => {
        callCount++
        if (callCount === 1) return makeSelectBuilder(makeExistingStub())
        return makeUpdateBuilder([makeUpdatedPatient({ phone: '11900000001' })])
      })

      const result = await service.updatePatient(TENANT_ID_U, PATIENT_ID_U, { phone: '11900000001' })

      expect(result).toMatchObject({ phone: '11900000001' })
    })
  })

  // -------------------------------------------------------------------------
  // Happy path — todos os campos opcionais de uma vez
  // -------------------------------------------------------------------------

  describe('updatePatient — todos os campos', () => {
    it('should update all optional fields and return patient without cpf or portal_access_code', async () => {
      const fullUpdate = {
        name: 'Novo Nome',
        phone: '11900000002',
        cpf: '12345678901',
        email: 'novo@example.com',
        status: 'inactive' as const,
      }

      let callCount = 0
      mockKnexUpdate.mockImplementation(() => {
        callCount++
        if (callCount === 1) return makeSelectBuilder(makeExistingStub())
        // returning nunca inclui cpf — retornamos sem o campo
        return makeUpdateBuilder([makeUpdatedPatient({ name: 'Novo Nome', phone: '11900000002', email: 'novo@example.com', status: 'inactive' })])
      })

      const result = await service.updatePatient(TENANT_ID_U, PATIENT_ID_U, fullUpdate)

      expect(result).not.toHaveProperty('cpf')
      expect(result).not.toHaveProperty('portal_access_code')
    })
  })

  // -------------------------------------------------------------------------
  // NotFoundException — paciente não encontrado
  // -------------------------------------------------------------------------

  describe('updatePatient — NotFoundException (paciente não encontrado)', () => {
    it('should throw NotFoundException when patient does not exist', async () => {
      mockKnexUpdate.mockImplementation(() => makeSelectBuilder(null))

      await expect(
        service.updatePatient(TENANT_ID_U, PATIENT_ID_U, { name: 'X' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException with message "Paciente não encontrado"', async () => {
      mockKnexUpdate.mockImplementation(() => makeSelectBuilder(null))

      await expect(
        service.updatePatient(TENANT_ID_U, PATIENT_ID_U, { name: 'X' }),
      ).rejects.toThrow('Paciente não encontrado')
    })
  })

  // -------------------------------------------------------------------------
  // Isolamento de tenant — paciente de outro tenant retorna 404
  // -------------------------------------------------------------------------

  describe('updatePatient — isolamento de tenant', () => {
    it('should throw NotFoundException when patient belongs to a different tenant', async () => {
      // .where({ id, tenant_id: outroTenant }) retorna null — não vazar existência
      mockKnexUpdate.mockImplementation(() => makeSelectBuilder(null))

      await expect(
        service.updatePatient('outro-tenant-uuid', PATIENT_ID_U, { name: 'X' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // -------------------------------------------------------------------------
  // ConflictException — phone duplicado (erro 23505)
  // -------------------------------------------------------------------------

  describe('updatePatient — conflito de telefone', () => {
    it('should throw ConflictException when phone already exists for tenant (error 23505)', async () => {
      const pgUniqueError = Object.assign(new Error('unique violation'), { code: '23505' })

      let callCount = 0
      mockKnexUpdate.mockImplementation(() => {
        callCount++
        if (callCount === 1) return makeSelectBuilder(makeExistingStub())
        // returning rejeita com erro de unique violation
        const returning = jest.fn().mockRejectedValue(pgUniqueError)
        const update = jest.fn().mockReturnValue({ returning })
        const where = jest.fn().mockReturnValue({ update })
        return { where, update, returning }
      })

      await expect(
        service.updatePatient(TENANT_ID_U, PATIENT_ID_U, { phone: '11999990000' }),
      ).rejects.toThrow(ConflictException)
    })

    it('should throw ConflictException with message "Telefone já cadastrado para outro paciente"', async () => {
      const pgUniqueError = Object.assign(new Error('unique violation'), { code: '23505' })

      let callCount = 0
      mockKnexUpdate.mockImplementation(() => {
        callCount++
        if (callCount === 1) return makeSelectBuilder(makeExistingStub())
        const returning = jest.fn().mockRejectedValue(pgUniqueError)
        const update = jest.fn().mockReturnValue({ returning })
        const where = jest.fn().mockReturnValue({ update })
        return { where, update, returning }
      })

      await expect(
        service.updatePatient(TENANT_ID_U, PATIENT_ID_U, { phone: '11999990000' }),
      ).rejects.toThrow('Telefone já cadastrado para outro paciente')
    })
  })

  // -------------------------------------------------------------------------
  // Re-throw — erro desconhecido não é capturado
  // -------------------------------------------------------------------------

  describe('updatePatient — re-throw de erros desconhecidos', () => {
    it('should re-throw non-unique errors without wrapping', async () => {
      const dbError = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })

      let callCount = 0
      mockKnexUpdate.mockImplementation(() => {
        callCount++
        if (callCount === 1) return makeSelectBuilder(makeExistingStub())
        const returning = jest.fn().mockRejectedValue(dbError)
        const update = jest.fn().mockReturnValue({ returning })
        const where = jest.fn().mockReturnValue({ update })
        return { where, update, returning }
      })

      await expect(
        service.updatePatient(TENANT_ID_U, PATIENT_ID_U, { name: 'X' }),
      ).rejects.toThrow('connection refused')

      callCount = 0
      await expect(
        service.updatePatient(TENANT_ID_U, PATIENT_ID_U, { name: 'X' }),
      ).rejects.not.toThrow(ConflictException)
    })
  })
})

// =============================================================================
// US-10.2 — getPatientPortalData
// =============================================================================

describe('PatientService — getPatientPortalData', () => {
  let service: PatientService
  let mockKnexPortal: jest.Mock

  const CODE = 'MRO-5678-PAC'

  /**
   * Row retornada pelo JOIN patients + tenants + doctors
   */
  const makePortalRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'patient-portal-uuid',
    name: 'Maria Oliveira',
    phone: '11988880001',
    email: 'maria.oliveira@example.com',
    date_of_birth: '1985-03-20',
    portal_active: true,
    status: 'active',
    tenant_id: 'tenant-portal-uuid',
    tenant_name: 'Clínica Dr. Silva',
    tenant_status: 'active',
    slug: 'dr-silva',
    primary_color: '#1D4ED8',
    logo_url: null,
    doctor_name: 'Dr. João Silva',
    doctor_specialty: 'Clínica Geral',
    doctor_timezone: 'America/Sao_Paulo',
    ...overrides,
  })

  const makePortalAppointment = (overrides: Record<string, unknown> = {}) => ({
    id: 'appt-portal-1',
    date_time: new Date('2024-03-10T14:00:00Z'),
    status: 'completed',
    duration_minutes: 60,
    started_at: new Date('2024-03-10T14:05:00Z'),
    completed_at: new Date('2024-03-10T15:00:00Z'),
    cancellation_reason: null,
    ...overrides,
  })

  const makePortalDocument = (overrides: Record<string, unknown> = {}) => ({
    id: 'doc-portal-1',
    type: 'prescription',
    file_url: '/uploads/tenant-portal-uuid/receita.pdf',
    file_name: 'receita_2024.pdf',
    description: 'Receita médica',
    created_at: new Date('2024-03-10T15:20:00Z'),
    ...overrides,
  })

  /**
   * Constrói um mock do query builder que suporta join (usado no getPatientPortalData).
   * O builder JOIN encadeia: .join().join().where().select().first()
   */
  const makeJoinBuilder = (firstValue: unknown) => {
    const builder: Record<string, jest.Mock> = {
      join: jest.fn(),
      where: jest.fn(),
      select: jest.fn(),
      first: jest.fn().mockResolvedValue(firstValue),
      orderBy: jest.fn().mockResolvedValue([]),
    }
    builder.join.mockReturnValue(builder)
    builder.where.mockReturnValue(builder)
    builder.select.mockReturnValue(builder)
    return builder
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const row = makePortalRow()
    const joinBuilder = makeJoinBuilder(row)

    const apptBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
    }
    const docBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
    }

    mockKnexPortal = jest.fn().mockImplementation((table: string) => {
      if (table === 'patients') return joinBuilder
      if (table === 'appointments') return apptBuilder
      if (table === 'documents') return docBuilder
      return joinBuilder
    })

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        { provide: KNEX, useValue: mockKnexPortal },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EventLogService, useValue: mockEventLogService },
      ],
    }).compile()

    service = moduleRef.get<PatientService>(PatientService)
  })

  // -------------------------------------------------------------------------
  // CT-102-01: Happy path — código válido retorna dados completos
  // -------------------------------------------------------------------------

  describe('CT-102-01: código válido retorna dados do portal', () => {
    it('should return patient, doctor, tenant, appointments and documents when code is valid', async () => {
      const row = makePortalRow()
      const appts = [makePortalAppointment(), makePortalAppointment({ id: 'appt-portal-2' })]
      const docs = [makePortalDocument()]

      const joinBuilder = makeJoinBuilder(row)
      const apptBuilder = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(appts),
      }
      const docBuilder = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(docs),
      }

      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        if (table === 'appointments') return apptBuilder
        if (table === 'documents') return docBuilder
        return makeJoinBuilder(null)
      })

      const result = await service.getPatientPortalData(CODE)

      expect(result.patient).toMatchObject({
        id: row.id,
        name: row.name,
        phone: row.phone,
        portal_active: true,
        status: 'active',
      })
      expect(result.doctor).toMatchObject({
        name: row.doctor_name,
        specialty: row.doctor_specialty,
        timezone: row.doctor_timezone,
      })
      expect(result.tenant).toMatchObject({
        name: row.tenant_name,
        slug: row.slug,
      })
      expect(result.appointments).toHaveLength(2)
      expect(result.documents).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-02: Código inexistente → NotFoundException
  // -------------------------------------------------------------------------

  describe('CT-102-02: código inexistente lança NotFoundException', () => {
    it('should throw NotFoundException("Código de acesso inválido") when code not found', async () => {
      const joinBuilder = makeJoinBuilder(null)
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData('XXX-0000-ZZZ')).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException with message "Código de acesso inválido"', async () => {
      const joinBuilder = makeJoinBuilder(null)
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData('XXX-0000-ZZZ')).rejects.toThrow(
        'Código de acesso inválido',
      )
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-03: portal_active=false → ForbiddenException('Portal inativo')
  // -------------------------------------------------------------------------

  describe('CT-102-03: portal_active=false lança ForbiddenException', () => {
    it('should throw ForbiddenException("Portal inativo") when portal_active is false', async () => {
      const row = makePortalRow({ portal_active: false })
      const joinBuilder = makeJoinBuilder(row)
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData(CODE)).rejects.toThrow(ForbiddenException)
    })

    it('should throw with message "Portal inativo"', async () => {
      const row = makePortalRow({ portal_active: false })
      const joinBuilder = makeJoinBuilder(row)
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData(CODE)).rejects.toThrow('Portal inativo')
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-04: patient.status=inactive → ForbiddenException('Paciente inativo')
  // -------------------------------------------------------------------------

  describe('CT-102-04: patient status=inactive lança ForbiddenException', () => {
    it('should throw ForbiddenException("Paciente inativo") when patient status is inactive', async () => {
      const row = makePortalRow({ status: 'inactive' })
      const joinBuilder = makeJoinBuilder(row)
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData(CODE)).rejects.toThrow(ForbiddenException)
    })

    it('should throw with message "Paciente inativo"', async () => {
      const row = makePortalRow({ status: 'inactive' })
      const joinBuilder = makeJoinBuilder(row)
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData(CODE)).rejects.toThrow('Paciente inativo')
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-05: tenant.status=inactive → ForbiddenException('Clínica inativa')
  // -------------------------------------------------------------------------

  describe('CT-102-05: tenant status=inactive lança ForbiddenException', () => {
    it('should throw ForbiddenException("Clínica inativa") when tenant status is inactive', async () => {
      const row = makePortalRow({ tenant_status: 'inactive' })
      const joinBuilder = makeJoinBuilder(row)
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData(CODE)).rejects.toThrow(ForbiddenException)
    })

    it('should throw with message "Clínica inativa"', async () => {
      const row = makePortalRow({ tenant_status: 'inactive' })
      const joinBuilder = makeJoinBuilder(row)
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData(CODE)).rejects.toThrow('Clínica inativa')
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-06: clinical_notes NUNCA aparecem na resposta
  // -------------------------------------------------------------------------

  describe('CT-102-06: clinical_notes ausentes da resposta', () => {
    it('should never include clinicalNotes in the response', async () => {
      const result = await service.getPatientPortalData(CODE)

      expect(result).not.toHaveProperty('clinicalNotes')
      expect(Object.keys(result)).not.toContain('clinicalNotes')
    })

    it('should never query the clinical_notes table', async () => {
      await service.getPatientPortalData(CODE)

      // Verificar que mockKnexPortal nunca foi chamado com 'clinical_notes'
      const tableCalls = mockKnexPortal.mock.calls.map((call: unknown[]) => call[0] as string)
      expect(tableCalls).not.toContain('clinical_notes')
    })

    it('response should contain exactly patient, doctor, tenant, appointments, documents', async () => {
      const result = await service.getPatientPortalData(CODE)

      const keys = Object.keys(result).sort()
      expect(keys).toEqual(['appointments', 'doctor', 'documents', 'patient', 'tenant'])
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-07: appointments incluem cancellation_reason (não notas)
  // -------------------------------------------------------------------------

  describe('CT-102-07: appointments incluem cancellation_reason', () => {
    it('should include cancellation_reason in each appointment', async () => {
      const appts = [
        makePortalAppointment({ cancellation_reason: null }),
        makePortalAppointment({ id: 'appt-2', status: 'cancelled', cancellation_reason: 'Paciente cancelou' }),
      ]

      const joinBuilder = makeJoinBuilder(makePortalRow())
      const apptBuilder = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(appts),
      }
      const docBuilder = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([]),
      }

      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        if (table === 'appointments') return apptBuilder
        if (table === 'documents') return docBuilder
        return makeJoinBuilder(null)
      })

      const result = await service.getPatientPortalData(CODE)

      // Appointments devem vir com cancellation_reason
      expect(result.appointments[0]).toHaveProperty('cancellation_reason')
      expect(result.appointments[1]).toHaveProperty('cancellation_reason', 'Paciente cancelou')
    })

    it('should request cancellation_reason field from appointments table', async () => {
      const joinBuilder = makeJoinBuilder(makePortalRow())
      const apptBuilder = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([]),
      }
      const docBuilder = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([]),
      }

      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        if (table === 'appointments') return apptBuilder
        if (table === 'documents') return docBuilder
        return makeJoinBuilder(null)
      })

      await service.getPatientPortalData(CODE)

      const selectArgs = apptBuilder.select.mock.calls[0][0] as string[]
      expect(selectArgs).toContain('cancellation_reason')
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-08: eventLogService.append chamado com 'patient.portal_accessed' (TD-23)
  //
  // Todo acesso ao portal do paciente deve ser auditado via event_log para
  // conformidade LGPD. O append é chamado ANTES das queries paralelas.
  // -------------------------------------------------------------------------

  describe('CT-102-08: eventLogService.append chamado com patient.portal_accessed [TD-23]', () => {
    it('should call eventLogService.append with patient.portal_accessed on valid access', async () => {
      const row = makePortalRow()

      await service.getPatientPortalData(CODE)

      expect(mockEventLogService.append).toHaveBeenCalledWith(
        row.tenant_id,
        'patient.portal_accessed',
        'patient',
        row.id,
        {},
      )
    })

    it('should call eventLogService.append exactly once per portal access', async () => {
      await service.getPatientPortalData(CODE)

      const appendCalls = (mockEventLogService.append as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[1] === 'patient.portal_accessed',
      )
      expect(appendCalls).toHaveLength(1)
    })

    it('should NOT call eventLogService.append when code is invalid', async () => {
      const joinBuilder = makeJoinBuilder(null) // código não encontrado
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData('INVALID-CODE')).rejects.toThrow(NotFoundException)

      expect(mockEventLogService.append).not.toHaveBeenCalledWith(
        expect.anything(),
        'patient.portal_accessed',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      )
    })

    it('should NOT call eventLogService.append when portal is inactive', async () => {
      const row = makePortalRow({ portal_active: false })
      const joinBuilder = makeJoinBuilder(row)
      mockKnexPortal.mockImplementation((table: string) => {
        if (table === 'patients') return joinBuilder
        return makeJoinBuilder(null)
      })

      await expect(service.getPatientPortalData(CODE)).rejects.toThrow('Portal inativo')

      expect(mockEventLogService.append).not.toHaveBeenCalledWith(
        expect.anything(),
        'patient.portal_accessed',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      )
    })

    it('should propagate exception if eventLogService.append fails', async () => {
      // O await é intencional — falha no audit trail deve propagar (não silenciar)
      const appendError = new Error('Event log unavailable')
      ;(mockEventLogService.append as jest.Mock).mockRejectedValueOnce(appendError)

      await expect(service.getPatientPortalData(CODE)).rejects.toThrow('Event log unavailable')
    })
  })
})

// =============================================================================
// US-10.2 — getPatientDocument
// =============================================================================

describe('PatientService — getPatientDocument', () => {
  let service: PatientService
  let mockKnexDoc: jest.Mock

  const CODE = 'MRO-5678-PAC'
  const DOC_ID = 'doc-uuid-download'

  /**
   * Row retornada pelo JOIN patients + tenants para validação do código
   */
  const makeAccessRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'patient-portal-uuid',
    portal_active: true,
    status: 'active',
    tenant_id: 'tenant-portal-uuid',
    tenant_status: 'active',
    ...overrides,
  })

  const makeDocumentRow = (overrides: Record<string, unknown> = {}) => ({
    id: DOC_ID,
    type: 'prescription',
    file_url: '/uploads/tenant-portal-uuid/receita.pdf',
    file_name: 'receita_2024.pdf',
    description: 'Receita médica',
    created_at: new Date('2024-03-10T15:20:00Z'),
    ...overrides,
  })

  /**
   * Builder para as duas queries do getPatientDocument:
   *  1. JOIN patients+tenants → valida código (retorna accessRow)
   *  2. knex('documents') → busca documento por id+patient_id+tenant_id (retorna documentRow)
   */
  const makeAccessBuilder = (firstValue: unknown) => {
    const builder: Record<string, jest.Mock> = {
      join: jest.fn(),
      where: jest.fn(),
      select: jest.fn(),
      first: jest.fn().mockResolvedValue(firstValue),
    }
    builder.join.mockReturnValue(builder)
    builder.where.mockReturnValue(builder)
    builder.select.mockReturnValue(builder)
    return builder
  }

  const makeDocumentBuilder = (firstValue: unknown) => ({
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(firstValue),
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    const accessBuilder = makeAccessBuilder(makeAccessRow())
    const documentBuilder = makeDocumentBuilder(makeDocumentRow())

    mockKnexDoc = jest.fn().mockImplementation((table: string) => {
      if (table === 'patients') return accessBuilder
      if (table === 'documents') return documentBuilder
      return makeAccessBuilder(null)
    })

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        { provide: KNEX, useValue: mockKnexDoc },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EventLogService, useValue: mockEventLogService },
      ],
    }).compile()

    service = moduleRef.get<PatientService>(PatientService)
  })

  // -------------------------------------------------------------------------
  // CT-102-08: happy path — documento pertence ao paciente
  // -------------------------------------------------------------------------

  describe('CT-102-08: código válido retorna documento', () => {
    it('should return the document when code is valid and document belongs to patient', async () => {
      const doc = makeDocumentRow()
      const accessBuilder = makeAccessBuilder(makeAccessRow())
      const documentBuilder = makeDocumentBuilder(doc)

      mockKnexDoc.mockImplementation((table: string) => {
        if (table === 'patients') return accessBuilder
        if (table === 'documents') return documentBuilder
        return makeAccessBuilder(null)
      })

      const result = await service.getPatientDocument(CODE, DOC_ID)

      expect(result).toEqual(doc)
    })

    it('should scope document query to patient_id and tenant_id for isolation', async () => {
      const accessRow = makeAccessRow()
      const accessBuilder = makeAccessBuilder(accessRow)
      const documentBuilder = makeDocumentBuilder(makeDocumentRow())

      mockKnexDoc.mockImplementation((table: string) => {
        if (table === 'patients') return accessBuilder
        if (table === 'documents') return documentBuilder
        return makeAccessBuilder(null)
      })

      await service.getPatientDocument(CODE, DOC_ID)

      expect(documentBuilder.where).toHaveBeenCalledWith({
        id: DOC_ID,
        patient_id: accessRow.id,
        tenant_id: accessRow.tenant_id,
      })
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-09: documento não encontrado → NotFoundException
  // -------------------------------------------------------------------------

  describe('CT-102-09: documento inexistente lança NotFoundException', () => {
    it('should throw NotFoundException("Documento não encontrado") when document not found', async () => {
      const accessBuilder = makeAccessBuilder(makeAccessRow())
      const documentBuilder = makeDocumentBuilder(null) // documento não existe

      mockKnexDoc.mockImplementation((table: string) => {
        if (table === 'patients') return accessBuilder
        if (table === 'documents') return documentBuilder
        return makeAccessBuilder(null)
      })

      await expect(service.getPatientDocument(CODE, DOC_ID)).rejects.toThrow(NotFoundException)
    })

    it('should throw with message "Documento não encontrado"', async () => {
      const accessBuilder = makeAccessBuilder(makeAccessRow())
      const documentBuilder = makeDocumentBuilder(null)

      mockKnexDoc.mockImplementation((table: string) => {
        if (table === 'patients') return accessBuilder
        if (table === 'documents') return documentBuilder
        return makeAccessBuilder(null)
      })

      await expect(service.getPatientDocument(CODE, DOC_ID)).rejects.toThrow(
        'Documento não encontrado',
      )
    })

    it('should throw NotFoundException when document belongs to another patient (isolation)', async () => {
      // Documento existe mas o where({id, patient_id, tenant_id}) não bate → null
      const accessBuilder = makeAccessBuilder(makeAccessRow())
      const documentBuilder = makeDocumentBuilder(null)

      mockKnexDoc.mockImplementation((table: string) => {
        if (table === 'patients') return accessBuilder
        if (table === 'documents') return documentBuilder
        return makeAccessBuilder(null)
      })

      await expect(service.getPatientDocument(CODE, 'doc-de-outro-paciente')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-10: código inválido → mesma validação que getPatientPortalData
  // -------------------------------------------------------------------------

  describe('CT-102-10: código inválido lança NotFoundException', () => {
    it('should throw NotFoundException("Código de acesso inválido") when code not found', async () => {
      const accessBuilder = makeAccessBuilder(null) // código não existe

      mockKnexDoc.mockImplementation((table: string) => {
        if (table === 'patients') return accessBuilder
        return makeAccessBuilder(null)
      })

      await expect(service.getPatientDocument('INVALID-CODE', DOC_ID)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('should throw with message "Código de acesso inválido" when code is invalid', async () => {
      const accessBuilder = makeAccessBuilder(null)

      mockKnexDoc.mockImplementation((table: string) => {
        if (table === 'patients') return accessBuilder
        return makeAccessBuilder(null)
      })

      await expect(service.getPatientDocument('INVALID-CODE', DOC_ID)).rejects.toThrow(
        'Código de acesso inválido',
      )
    })

    it('should throw ForbiddenException("Portal inativo") when portal_active is false', async () => {
      const accessBuilder = makeAccessBuilder(makeAccessRow({ portal_active: false }))

      mockKnexDoc.mockImplementation((table: string) => {
        if (table === 'patients') return accessBuilder
        return makeAccessBuilder(null)
      })

      await expect(service.getPatientDocument(CODE, DOC_ID)).rejects.toThrow(ForbiddenException)
    })
  })
})

// =============================================================================
// US-9.1 — activatePortal
// =============================================================================

describe('PatientService — activatePortal', () => {
  let service: PatientService
  let mockKnexActivate: jest.Mock

  const TENANT_ID_A = 'tenant-uuid-activate'
  const PATIENT_ID_A = 'patient-uuid-activate'

  const makePatientRow = (overrides: Record<string, unknown> = {}) => ({
    id: PATIENT_ID_A,
    phone: '11999990000',
    portal_active: false,
    portal_access_code: 'ABC-1234-XYZ',
    ...overrides,
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    mockKnexActivate = jest.fn()

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        { provide: KNEX, useValue: mockKnexActivate },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EventLogService, useValue: mockEventLogService },
      ],
    }).compile()

    service = moduleRef.get<PatientService>(PatientService)
  })

  // -------------------------------------------------------------------------
  // CT-91-03a: NotFoundException quando paciente não existe
  // -------------------------------------------------------------------------

  it('CT-91-03a: should throw NotFoundException when patient does not exist', async () => {
    const selectBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
    }
    mockKnexActivate.mockReturnValue(selectBuilder)

    await expect(service.activatePortal(TENANT_ID_A, PATIENT_ID_A)).rejects.toThrow(
      'Paciente não encontrado',
    )
  })

  // -------------------------------------------------------------------------
  // CT-91-03b: portal já ativo → retorna sem emitir evento
  // -------------------------------------------------------------------------

  it('CT-91-03b: should return without emitting event when portal is already active', async () => {
    const patient = makePatientRow({ portal_active: true })
    const selectBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(patient),
    }
    mockKnexActivate.mockReturnValue(selectBuilder)

    await service.activatePortal(TENANT_ID_A, PATIENT_ID_A)

    expect(mockEventEmitter.emit).not.toHaveBeenCalled()
    expect(mockEventLogService.append).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // CT-91-03c: portal inativo → ativa, appenda log, emite evento
  // -------------------------------------------------------------------------

  it('CT-91-03c: should update portal_active, append event_log, and emit event when inactive', async () => {
    const patient = makePatientRow({ portal_active: false })

    const selectBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(patient),
    }
    const updateBuilder = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
    }

    let callCount = 0
    mockKnexActivate.mockImplementation((table: string) => {
      if (table === 'patients') {
        callCount++
        return callCount === 1 ? selectBuilder : updateBuilder
      }
      throw new Error(`Tabela inesperada no mock: ${table}`)
    })

    await service.activatePortal(TENANT_ID_A, PATIENT_ID_A)

    // UPDATE foi chamado com portal_active: true
    expect(updateBuilder.update).toHaveBeenCalledWith({ portal_active: true })
    expect(updateBuilder.where).toHaveBeenCalledWith({ id: PATIENT_ID_A, tenant_id: TENANT_ID_A })

    // eventLogService.append foi chamado
    expect(mockEventLogService.append).toHaveBeenCalledWith(
      TENANT_ID_A,
      'patient.portal_activated',
      'system',
      null,
      expect.objectContaining({ patientId: PATIENT_ID_A, phone: patient.phone }),
    )

    // EventEmitter2.emit foi chamado
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'patient.portal_activated',
      expect.objectContaining({
        tenantId: TENANT_ID_A,
        patientId: PATIENT_ID_A,
        phone: patient.phone,
      }),
    )
  })

  // -------------------------------------------------------------------------
  // CT-91-03d: isolamento de tenant no SELECT
  // -------------------------------------------------------------------------

  it('CT-91-03d: should scope SELECT to tenant_id', async () => {
    const selectBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
    }
    mockKnexActivate.mockReturnValue(selectBuilder)

    await expect(service.activatePortal(TENANT_ID_A, PATIENT_ID_A)).rejects.toThrow()

    expect(selectBuilder.where).toHaveBeenCalledWith({
      id: PATIENT_ID_A,
      tenant_id: TENANT_ID_A,
    })
  })
})
