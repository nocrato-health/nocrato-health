/**
 * US-2.1 — Dashboard da agência (getDashboardStats)
 * US-2.2 — Listagem paginada de doutores (listDoctors)
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder encadeável do Knex
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - Knex.count() retorna string do PostgreSQL — verificamos que o service converte com Number()
 *  - Para listDoctors: builder encadeável que suporta join, select, orderBy, limit, offset, where
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
import { AgencyService } from './agency.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface MockCountBuilder {
  where: jest.Mock
  whereIn: jest.Mock
  count: jest.Mock
}

interface MockListBuilder {
  join: jest.Mock
  select: jest.Mock
  orderBy: jest.Mock
  limit: jest.Mock
  // offset is the terminal call — mockResolvedValue returns the rows
  offset: jest.Mock
  where: jest.Mock
}

interface MockListCountBuilder {
  // count is the terminal call — mockResolvedValue returns [{count: string}]
  count: jest.Mock
  where: jest.Mock
}

// ---------------------------------------------------------------------------
// Tipos auxiliares do Knex mock
// ---------------------------------------------------------------------------

type KnexMockFn = jest.Mock & { fn: { now: jest.Mock } }

// ---------------------------------------------------------------------------
// Factories de mock do Knex
// ---------------------------------------------------------------------------

/**
 * Constrói um builder encadeável para a query de dados de listDoctors.
 *
 * Cadeia real no service:
 *   knex('doctors as d').join(...).select(...).orderBy(...).limit(...).offset(...)
 *   com um .where(...) opcional inserido antes de offset quando status é fornecido.
 *
 * A estratégia segue o mesmo padrão do buildCountBuilder:
 * o método TERMINAL (offset) usa mockResolvedValue para retornar as rows;
 * todos os demais métodos encadeáveis usam mockReturnThis().
 * Isso evita adicionar `then` a um objeto comum (S7739).
 */
function buildListBuilder(rows: object[]): MockListBuilder {
  const builder: MockListBuilder = {
    join: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    // offset é o último método chamado — é o terminal que resolve a Promise
    offset: jest.fn().mockResolvedValue(rows),
  }
  return builder
}

/**
 * Constrói um builder encadeável para a query de COUNT de listDoctors.
 *
 * Cadeia real no service:
 *   knex('doctors as d').count('d.id as count')
 *   com um .where(...) opcional antes de count quando status é fornecido.
 *
 * count é o método terminal — usa mockResolvedValue.
 * where usa mockReturnThis() pois é encadeável.
 */
function buildListCountBuilder(countValue: string): MockListCountBuilder {
  const builder: MockListCountBuilder = {
    where: jest.fn().mockReturnThis(),
    // count é o método terminal — resolve a Promise com o resultado
    count: jest.fn().mockResolvedValue([{ count: countValue }]),
  }
  return builder
}

/**
 * Monta o mock do Knex completo para listDoctors.
 *
 * knex() é chamado duas vezes:
 *  1. knex('doctors as d') → listBuilder  (query de dados)
 *  2. knex('doctors as d') → countBuilder (query de contagem)
 *
 * As duas são executadas em paralelo via Promise.all.
 */
function buildListDoctorsKnex({
  rows = [] as object[],
  total = '0',
  dashboardCalls = 0,
}: {
  rows?: object[]
  total?: string
  dashboardCalls?: number
} = {}) {
  const listBuilder = buildListBuilder(rows)
  const countBuilder = buildListCountBuilder(total)

  // Se existirem calls de dashboard anteriores (para reutilizar o módulo), precisamos
  // adicionar mockReturnValueOnce para cada call do dashboard antes das duas calls do listDoctors.
  // Em geral, cada teste cria um módulo isolado, então dashboardCalls = 0.
  const mockKnexFn = jest.fn() as KnexMockFn

  // Preenche slots para eventual dashboard antes, depois as duas do listDoctors
  for (let i = 0; i < dashboardCalls; i++) {
    mockKnexFn.mockReturnValueOnce(buildCountBuilder('0'))
  }

  mockKnexFn
    .mockReturnValueOnce(listBuilder)   // 1ª call: query de dados
    .mockReturnValueOnce(countBuilder)  // 2ª call: query de contagem

  mockKnexFn.fn = { now: jest.fn().mockReturnValue('NOW()') }

  return { mockKnexFn, listBuilder, countBuilder }
}

/**
 * Constrói um builder encadeável para queries de COUNT.
 * where() e whereIn() retornam this; count() retorna uma Promise com [{count: string}].
 */
function buildCountBuilder(countValue: string): MockCountBuilder {
  const builder: MockCountBuilder = {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    count: jest.fn().mockResolvedValue([{ count: countValue }]),
  }
  return builder
}

/**
 * Constrói o mock do Knex para getDashboardStats.
 *
 * Ordem de chamadas ao knex() em getDashboardStats:
 *  1. knex('doctors').count('id as count')                                    → totalDoctors
 *  2. knex('doctors').where({ status: 'active' }).count('id as count')        → activeDoctors
 *  3. knex('patients').count('id as count')                                   → totalPatients
 *  4. knex('appointments').count('id as count')                               → totalAppointments
 *  5. knex('appointments').where(...).whereIn(...).count('id as count')       → upcomingAppointments
 */
function buildDashboardKnex({
  totalDoctors = '5',
  activeDoctors = '3',
  totalPatients = '120',
  totalAppointments = '450',
  upcomingAppointments = '12',
} = {}) {
  const totalDoctorsBuilder = buildCountBuilder(totalDoctors)
  const activeDoctorsBuilder = buildCountBuilder(activeDoctors)
  const totalPatientsBuilder = buildCountBuilder(totalPatients)
  const totalAppointmentsBuilder = buildCountBuilder(totalAppointments)
  const upcomingAppointmentsBuilder = buildCountBuilder(upcomingAppointments)

  const mockKnexFn = (
    jest.fn()
      .mockReturnValueOnce(totalDoctorsBuilder)         // call 1: doctors (total)
      .mockReturnValueOnce(activeDoctorsBuilder)        // call 2: doctors (active)
      .mockReturnValueOnce(totalPatientsBuilder)        // call 3: patients (total)
      .mockReturnValueOnce(totalAppointmentsBuilder)    // call 4: appointments (total)
      .mockReturnValueOnce(upcomingAppointmentsBuilder) // call 5: appointments (upcoming)
  ) as KnexMockFn

  mockKnexFn.fn = { now: jest.fn().mockReturnValue('NOW()') }

  return {
    mockKnexFn,
    totalDoctorsBuilder,
    activeDoctorsBuilder,
    totalPatientsBuilder,
    totalAppointmentsBuilder,
    upcomingAppointmentsBuilder,
  }
}

// ---------------------------------------------------------------------------
// Helper para criar o módulo de testes
// ---------------------------------------------------------------------------

async function buildModule(knexFn: KnexMockFn): Promise<AgencyService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AgencyService,
      { provide: KNEX, useValue: knexFn },
    ],
  }).compile()

  return module.get<AgencyService>(AgencyService)
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('AgencyService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ==========================================================================
  // US-2.1 — getDashboardStats
  // ==========================================================================

  describe('getDashboardStats', () => {
    // ------------------------------------------------------------------------
    // Happy path — estrutura de retorno
    // ------------------------------------------------------------------------

    describe('Happy path', () => {
      it('retorna objeto com exatamente 5 campos numéricos', async () => {
        const { mockKnexFn } = buildDashboardKnex({
          totalDoctors: '5',
          activeDoctors: '3',
          totalPatients: '120',
          totalAppointments: '450',
          upcomingAppointments: '12',
        })

        const service = await buildModule(mockKnexFn)
        const result = await service.getDashboardStats()

        expect(Object.keys(result).sort()).toEqual([
          'activeDoctors',
          'totalAppointments',
          'totalDoctors',
          'totalPatients',
          'upcomingAppointments',
        ])
      })

      it('retorna os valores corretos mapeados das contagens do banco', async () => {
        const { mockKnexFn } = buildDashboardKnex({
          totalDoctors: '5',
          activeDoctors: '3',
          totalPatients: '120',
          totalAppointments: '450',
          upcomingAppointments: '12',
        })

        const service = await buildModule(mockKnexFn)
        const result = await service.getDashboardStats()

        expect(result).toEqual({
          totalDoctors: 5,
          activeDoctors: 3,
          totalPatients: 120,
          totalAppointments: 450,
          upcomingAppointments: 12,
        })
      })

      it('todos os valores retornados são do tipo Number (não string)', async () => {
        const { mockKnexFn } = buildDashboardKnex({
          totalDoctors: '10',
          activeDoctors: '7',
          totalPatients: '200',
          totalAppointments: '900',
          upcomingAppointments: '25',
        })

        const service = await buildModule(mockKnexFn)
        const result = await service.getDashboardStats()

        expect(typeof result.totalDoctors).toBe('number')
        expect(typeof result.activeDoctors).toBe('number')
        expect(typeof result.totalPatients).toBe('number')
        expect(typeof result.totalAppointments).toBe('number')
        expect(typeof result.upcomingAppointments).toBe('number')
      })

      it('converte string "0" do PostgreSQL para o número 0 quando tabelas estão vazias', async () => {
        const { mockKnexFn } = buildDashboardKnex({
          totalDoctors: '0',
          activeDoctors: '0',
          totalPatients: '0',
          totalAppointments: '0',
          upcomingAppointments: '0',
        })

        const service = await buildModule(mockKnexFn)
        const result = await service.getDashboardStats()

        expect(result.totalDoctors).toBe(0)
        expect(result.activeDoctors).toBe(0)
        expect(result.totalPatients).toBe(0)
        expect(result.totalAppointments).toBe(0)
        expect(result.upcomingAppointments).toBe(0)
        // Garante que são números, não strings
        expect(result.totalDoctors).toStrictEqual(0)
      })
    })

    // ------------------------------------------------------------------------
    // Invariante de negócio: activeDoctors <= totalDoctors
    // ------------------------------------------------------------------------

    describe('Invariante: activeDoctors <= totalDoctors', () => {
      it('activeDoctors é menor que totalDoctors quando há doutores inativos', async () => {
        const { mockKnexFn } = buildDashboardKnex({
          totalDoctors: '10',
          activeDoctors: '7',
          totalPatients: '50',
          totalAppointments: '200',
          upcomingAppointments: '5',
        })

        const service = await buildModule(mockKnexFn)
        const result = await service.getDashboardStats()

        expect(result.activeDoctors).toBeLessThanOrEqual(result.totalDoctors)
      })

      it('activeDoctors pode ser igual a totalDoctors quando todos estão ativos', async () => {
        const { mockKnexFn } = buildDashboardKnex({
          totalDoctors: '5',
          activeDoctors: '5',
          totalPatients: '30',
          totalAppointments: '100',
          upcomingAppointments: '3',
        })

        const service = await buildModule(mockKnexFn)
        const result = await service.getDashboardStats()

        expect(result.activeDoctors).toBe(result.totalDoctors)
      })
    })

    // ------------------------------------------------------------------------
    // Verificação das queries Knex — activeDoctors filtra por status: 'active'
    // ------------------------------------------------------------------------

    describe('Queries Knex', () => {
      it('filtra activeDoctors com where({ status: "active" })', async () => {
        const { mockKnexFn, activeDoctorsBuilder } = buildDashboardKnex()

        const service = await buildModule(mockKnexFn)
        await service.getDashboardStats()

        expect(activeDoctorsBuilder.where).toHaveBeenCalledWith({ status: 'active' })
      })

      it('filtra upcomingAppointments com date_time > NOW() e whereIn status', async () => {
        const { mockKnexFn, upcomingAppointmentsBuilder } = buildDashboardKnex()

        const service = await buildModule(mockKnexFn)
        await service.getDashboardStats()

        expect(upcomingAppointmentsBuilder.where).toHaveBeenCalledWith(
          'date_time',
          '>',
          'NOW()',
        )
        expect(upcomingAppointmentsBuilder.whereIn).toHaveBeenCalledWith('status', [
          'scheduled',
          'waiting',
        ])
      })

      it('faz exatamente 5 chamadas ao knex() (uma por métrica)', async () => {
        const { mockKnexFn } = buildDashboardKnex()

        const service = await buildModule(mockKnexFn)
        await service.getDashboardStats()

        expect(mockKnexFn).toHaveBeenCalledTimes(5)
      })

      it('consulta tabelas corretas na ordem: doctors, doctors, patients, appointments, appointments', async () => {
        const { mockKnexFn } = buildDashboardKnex()

        const service = await buildModule(mockKnexFn)
        await service.getDashboardStats()

        expect(mockKnexFn).toHaveBeenNthCalledWith(1, 'doctors')
        expect(mockKnexFn).toHaveBeenNthCalledWith(2, 'doctors')
        expect(mockKnexFn).toHaveBeenNthCalledWith(3, 'patients')
        expect(mockKnexFn).toHaveBeenNthCalledWith(4, 'appointments')
        expect(mockKnexFn).toHaveBeenNthCalledWith(5, 'appointments')
      })

      it('não aplica filtro de tenant_id em nenhuma das queries (stats globais da agência)', async () => {
        const { mockKnexFn, totalDoctorsBuilder, activeDoctorsBuilder, totalPatientsBuilder, totalAppointmentsBuilder, upcomingAppointmentsBuilder } = buildDashboardKnex()

        const service = await buildModule(mockKnexFn)
        await service.getDashboardStats()

        // totalDoctors não usa where (exceto activeDoctors que filtra por status)
        expect(totalDoctorsBuilder.where).not.toHaveBeenCalled()
        expect(totalPatientsBuilder.where).not.toHaveBeenCalled()
        expect(totalAppointmentsBuilder.where).not.toHaveBeenCalled()

        // Nenhum builder deve receber tenant_id
        for (const builder of [
          activeDoctorsBuilder,
          upcomingAppointmentsBuilder,
        ]) {
          const whereCalls: Array<unknown> = builder.where.mock.calls.flat()
          expect(JSON.stringify(whereCalls)).not.toContain('tenant_id')
        }
      })
    })

    // ------------------------------------------------------------------------
    // upcomingAppointments — filtragem correta por status
    // ------------------------------------------------------------------------

    describe('upcomingAppointments', () => {
      it('retorna 0 quando não há consultas futuras agendadas', async () => {
        const { mockKnexFn } = buildDashboardKnex({
          totalDoctors: '5',
          activeDoctors: '3',
          totalPatients: '120',
          totalAppointments: '450',
          upcomingAppointments: '0',
        })

        const service = await buildModule(mockKnexFn)
        const result = await service.getDashboardStats()

        expect(result.upcomingAppointments).toBe(0)
      })

      it('inclui apenas status "scheduled" e "waiting" no filtro whereIn', async () => {
        const { mockKnexFn, upcomingAppointmentsBuilder } = buildDashboardKnex()

        const service = await buildModule(mockKnexFn)
        await service.getDashboardStats()

        const whereInArgs = upcomingAppointmentsBuilder.whereIn.mock.calls[0]
        expect(whereInArgs[0]).toBe('status')
        expect(whereInArgs[1]).toContain('scheduled')
        expect(whereInArgs[1]).toContain('waiting')
        expect(whereInArgs[1]).not.toContain('completed')
        expect(whereInArgs[1]).not.toContain('cancelled')
        expect(whereInArgs[1]).not.toContain('in_progress')
      })
    })
  })

  // ==========================================================================
  // US-2.2 — listDoctors
  // ==========================================================================

  describe('listDoctors', () => {
    // -------------------------------------------------------------------------
    // Estrutura de retorno
    // -------------------------------------------------------------------------

    describe('Estrutura de retorno', () => {
      it('retorna objeto com campos "data" e "pagination"', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ rows: [], total: '0' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(1, 20)

        expect(result).toHaveProperty('data')
        expect(result).toHaveProperty('pagination')
      })

      it('pagination contém page, limit, total e totalPages', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ rows: [], total: '42' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(1, 20)

        expect(Object.keys(result.pagination).sort()).toEqual([
          'limit',
          'page',
          'total',
          'totalPages',
        ])
      })

      it('data contém os rows retornados pelo banco', async () => {
        const rows = [
          {
            id: 'uuid-1',
            name: 'Dr. João',
            email: 'joao@test.com',
            slug: 'dr-joao',
            crm: '12345',
            specialty: 'Clínica Geral',
            status: 'active',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ]
        const { mockKnexFn } = buildListDoctorsKnex({ rows, total: '1' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(1, 20)

        expect(result.data).toEqual(rows)
      })

      it('retorna data: [] e pagination.total = 0 quando banco está vazio', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ rows: [], total: '0' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(1, 20)

        expect(result.data).toEqual([])
        expect(result.pagination.total).toBe(0)
      })
    })

    // -------------------------------------------------------------------------
    // Paginação
    // -------------------------------------------------------------------------

    describe('Paginação', () => {
      it('pagination.total reflete o count retornado pelo banco', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ total: '42' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(1, 20)

        expect(result.pagination.total).toBe(42)
      })

      it('pagination.total é do tipo Number (não string)', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ total: '7' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(1, 20)

        expect(typeof result.pagination.total).toBe('number')
      })

      it('pagination.totalPages = ceil(total / limit)', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ total: '42' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(1, 20)

        expect(result.pagination.totalPages).toBe(Math.ceil(42 / 20)) // 3
      })

      it('totalPages = 1 quando total <= limit', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ total: '5' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(1, 20)

        expect(result.pagination.totalPages).toBe(1)
      })

      it('totalPages = 0 quando total = 0', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ total: '0' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(1, 20)

        expect(result.pagination.totalPages).toBe(0)
      })

      it('pagination.page e pagination.limit espelham os parâmetros recebidos', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ total: '100' })
        const service = await buildModule(mockKnexFn)

        const result = await service.listDoctors(3, 10)

        expect(result.pagination.page).toBe(3)
        expect(result.pagination.limit).toBe(10)
      })

      it('offset é calculado corretamente: (page - 1) * limit', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '100' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(3, 10)

        // page=3, limit=10 → offset = (3-1)*10 = 20
        expect(listBuilder.offset).toHaveBeenCalledWith(20)
      })

      it('offset = 0 para page = 1', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '50' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        expect(listBuilder.offset).toHaveBeenCalledWith(0)
      })
    })

    // -------------------------------------------------------------------------
    // Filtro por status
    // -------------------------------------------------------------------------

    describe('Filtro por status', () => {
      it('aplica where("d.status", status) na query de dados quando status é fornecido', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '3' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20, 'active')

        expect(listBuilder.where).toHaveBeenCalledWith('d.status', 'active')
      })

      it('aplica where na query de contagem quando status é fornecido', async () => {
        const { mockKnexFn, countBuilder } = buildListDoctorsKnex({ total: '3' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20, 'inactive')

        expect(countBuilder.where).toHaveBeenCalledWith('d.status', 'inactive')
      })

      it('não aplica where quando status é undefined', async () => {
        const { mockKnexFn, listBuilder, countBuilder } = buildListDoctorsKnex({ total: '10' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        expect(listBuilder.where).not.toHaveBeenCalled()
        expect(countBuilder.where).not.toHaveBeenCalled()
      })

      it('aceita status "inactive" como filtro válido', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '2' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20, 'inactive')

        expect(listBuilder.where).toHaveBeenCalledWith('d.status', 'inactive')
      })
    })

    // -------------------------------------------------------------------------
    // Queries em paralelo e estrutura Knex
    // -------------------------------------------------------------------------

    describe('Queries Knex', () => {
      it('executa as duas queries em paralelo via Promise.all (knex chamado 2 vezes)', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ total: '5' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        // knex() é chamado uma vez para a query de dados e uma vez para a de contagem
        expect(mockKnexFn).toHaveBeenCalledTimes(2)
      })

      it('ambas as calls ao knex() usam "doctors as d"', async () => {
        const { mockKnexFn } = buildListDoctorsKnex({ total: '5' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        expect(mockKnexFn).toHaveBeenNthCalledWith(1, 'doctors as d')
        expect(mockKnexFn).toHaveBeenNthCalledWith(2, 'doctors as d')
      })

      it('query de dados faz JOIN em tenants usando tenant_id', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '1' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        expect(listBuilder.join).toHaveBeenCalledWith('tenants as t', 'd.tenant_id', 't.id')
      })

      it('query de dados ordena por d.created_at desc', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '1' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        expect(listBuilder.orderBy).toHaveBeenCalledWith('d.created_at', 'desc')
      })

      it('query de dados aplica o limit correto', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '50' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(2, 15)

        expect(listBuilder.limit).toHaveBeenCalledWith(15)
      })

      it('query de contagem usa count("d.id as count")', async () => {
        const { mockKnexFn, countBuilder } = buildListDoctorsKnex({ total: '10' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        expect(countBuilder.count).toHaveBeenCalledWith('d.id as count')
      })

      it('select inclui t.slug (campo que vem do JOIN com tenants)', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '1' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        const selectArgs: string[] = listBuilder.select.mock.calls.flat()
        expect(selectArgs).toContain('t.slug')
      })

      it('select não inclui password_hash nem working_hours', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '1' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        const selectArgs: string[] = listBuilder.select.mock.calls.flat()
        expect(selectArgs.join(',')).not.toContain('password_hash')
        expect(selectArgs.join(',')).not.toContain('working_hours')
      })

      it('mapeia created_at para createdAt no select', async () => {
        const { mockKnexFn, listBuilder } = buildListDoctorsKnex({ total: '1' })
        const service = await buildModule(mockKnexFn)

        await service.listDoctors(1, 20)

        const selectArgs: string[] = listBuilder.select.mock.calls.flat()
        expect(selectArgs).toContain('d.created_at as createdAt')
      })
    })
  })
})
