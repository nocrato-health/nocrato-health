/**
 * US-4.1 — Controller spec: PatientController
 *
 * Estratégia: testar que o handler delega ao service com os argumentos corretos
 * (tenantId, query dto). Os guards são desabilitados — são testados isoladamente.
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
import { ExecutionContext } from '@nestjs/common'
import { PatientController } from './patient.controller'
import { PatientService } from './patient.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { RolesGuard } from '@/common/guards/roles.guard'

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

const makePaginatedResponse = (patients: ReturnType<typeof makePatient>[], total = 1) => ({
  data: patients,
  pagination: {
    page: 1,
    limit: 20,
    total,
    totalPages: Math.ceil(total / 20),
  },
})

// ---------------------------------------------------------------------------
// Guard passthrough mock (desabilita guards nas specs de controller)
// ---------------------------------------------------------------------------

const allowAllGuard = {
  canActivate: (_ctx: ExecutionContext) => true,
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PatientController', () => {
  let controller: PatientController
  let service: jest.Mocked<PatientService>

  beforeEach(async () => {
    const mockService: jest.Mocked<Partial<PatientService>> = {
      listPatients: jest.fn(),
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PatientController],
      providers: [
        { provide: PatientService, useValue: mockService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAllGuard)
      .overrideGuard(TenantGuard)
      .useValue(allowAllGuard)
      .overrideGuard(RolesGuard)
      .useValue(allowAllGuard)
      .compile()

    controller = moduleRef.get<PatientController>(PatientController)
    service = moduleRef.get(PatientService)
  })

  // -------------------------------------------------------------------------
  // GET /doctor/patients
  // -------------------------------------------------------------------------

  describe('listPatients', () => {
    it('should call patientService.listPatients with tenantId and query dto', async () => {
      const query = { page: 1, limit: 20 }
      const expected = makePaginatedResponse([makePatient()])
      service.listPatients.mockResolvedValue(expected)

      const result = await controller.listPatients(TENANT_ID, query)

      expect(service.listPatients).toHaveBeenCalledWith(TENANT_ID, query)
      expect(result).toEqual(expected)
    })

    it('should pass search and status filters to the service', async () => {
      const query = { page: 1, limit: 20, search: 'Maria', status: 'active' as const }
      const expected = makePaginatedResponse([makePatient()])
      service.listPatients.mockResolvedValue(expected)

      const result = await controller.listPatients(TENANT_ID, query)

      expect(service.listPatients).toHaveBeenCalledWith(TENANT_ID, query)
      expect(result).toEqual(expected)
    })

    it('should return the service result directly', async () => {
      const patients = [
        makePatient({ id: 'patient-uuid-1' }),
        makePatient({ id: 'patient-uuid-2', name: 'João Costa' }),
      ]
      const expected = makePaginatedResponse(patients, 2)
      service.listPatients.mockResolvedValue(expected)

      const result = await controller.listPatients(TENANT_ID, { page: 1, limit: 20 })

      expect(result).toBe(expected)
    })

    it('should return empty list when service returns no results', async () => {
      const expected = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }
      service.listPatients.mockResolvedValue(expected)

      const result = await controller.listPatients(TENANT_ID, { page: 1, limit: 20 })

      expect(result.data).toEqual([])
      expect(result.pagination.total).toBe(0)
    })
  })
})
