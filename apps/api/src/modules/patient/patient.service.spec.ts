/**
 * US-4.1 — Listagem paginada de pacientes (PatientService)
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder encadeável do Knex
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - Knex.count() retorna string do PostgreSQL — verificamos que o service converte com Number()
 *  - cpf e portal_access_code NÃO devem aparecer na resposta (campos sensíveis)
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
import { PatientService } from './patient.service'
import { KNEX } from '@/database/knex.provider'

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
