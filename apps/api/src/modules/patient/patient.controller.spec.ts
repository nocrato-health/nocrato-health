/**
 * US-4.1 — Controller spec: PatientController (listPatients)
 * US-4.2 — Controller spec: PatientController (getPatientProfile)
 * US-4.3 — Controller spec: PatientController (createPatient)
 * US-4.4 — Controller spec: PatientController (updatePatient)
 *
 * Estratégia: testar que o handler delega ao service com os argumentos corretos
 * (tenantId, query dto / patientId / body dto). Os guards são desabilitados — são testados isoladamente.
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
    DOCUMENT_ENCRYPTION_KEY: 'a'.repeat(64),
  },
}))

import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, ExecutionContext, NotFoundException } from '@nestjs/common'
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
// Fixtures US-4.2
// ---------------------------------------------------------------------------

const PATIENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

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

const makeProfileResponse = () => ({
  patient: makePatientProfile(),
  appointments: [],
  clinicalNotes: [],
  documents: [],
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
      getPatientProfile: jest.fn(),
      getDoctorPatientDocument: jest.fn(),
      createPatient: jest.fn(),
      updatePatient: jest.fn(),
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

  // -------------------------------------------------------------------------
  // GET /doctor/patients/:id — US-4.2
  // -------------------------------------------------------------------------

  describe('getPatientProfile', () => {
    it('should call getPatientProfile with tenantId from JWT and patientId from param', async () => {
      const expected = makeProfileResponse()
      service.getPatientProfile.mockResolvedValue(expected)

      const result = await controller.getPatientProfile(TENANT_ID, PATIENT_ID)

      expect(service.getPatientProfile).toHaveBeenCalledWith(TENANT_ID, PATIENT_ID)
      expect(result).toEqual(expected)
    })

    it('should return the service result directly', async () => {
      const expected = makeProfileResponse()
      service.getPatientProfile.mockResolvedValue(expected)

      const result = await controller.getPatientProfile(TENANT_ID, PATIENT_ID)

      expect(result).toBe(expected)
    })

    it('should propagate NotFoundException when service throws it', async () => {
      service.getPatientProfile.mockRejectedValue(new NotFoundException('Paciente não encontrado'))

      await expect(
        controller.getPatientProfile(TENANT_ID, PATIENT_ID),
      ).rejects.toThrow(NotFoundException)
    })

    it('should propagate NotFoundException message when patient not found', async () => {
      service.getPatientProfile.mockRejectedValue(new NotFoundException('Paciente não encontrado'))

      await expect(
        controller.getPatientProfile(TENANT_ID, PATIENT_ID),
      ).rejects.toThrow('Paciente não encontrado')
    })
  })

  // -------------------------------------------------------------------------
  // POST /doctor/patients — US-4.3
  // -------------------------------------------------------------------------

  describe('createPatient', () => {
    const makeCreateDto = (overrides: Record<string, unknown> = {}) => ({
      name: 'João Costa',
      phone: '11988880000',
      ...overrides,
    })

    const makeCreatedPatient = (overrides: Record<string, unknown> = {}) => ({
      id: 'new-patient-uuid',
      name: 'João Costa',
      phone: '11988880000',
      email: null,
      source: 'manual',
      status: 'active',
      created_at: new Date('2024-03-01T09:00:00Z'),
      ...overrides,
    })

    it('should call patientService.createPatient with tenantId from JWT and body dto', async () => {
      const dto = makeCreateDto()
      const created = makeCreatedPatient()
      service.createPatient.mockResolvedValue(created)

      const result = await controller.createPatient(TENANT_ID, dto)

      expect(service.createPatient).toHaveBeenCalledWith(TENANT_ID, dto)
      expect(result).toEqual(created)
    })

    it('should return the service result directly', async () => {
      const dto = makeCreateDto({ email: 'joao@example.com' })
      const created = makeCreatedPatient({ email: 'joao@example.com' })
      service.createPatient.mockResolvedValue(created)

      const result = await controller.createPatient(TENANT_ID, dto)

      expect(result).toBe(created)
    })

    it('should propagate ConflictException when phone is already registered', async () => {
      service.createPatient.mockRejectedValue(
        new ConflictException('Telefone já cadastrado para outro paciente'),
      )

      await expect(
        controller.createPatient(TENANT_ID, makeCreateDto()),
      ).rejects.toThrow(ConflictException)
    })

    it('should propagate ConflictException message when phone conflicts', async () => {
      service.createPatient.mockRejectedValue(
        new ConflictException('Telefone já cadastrado para outro paciente'),
      )

      await expect(
        controller.createPatient(TENANT_ID, makeCreateDto()),
      ).rejects.toThrow('Telefone já cadastrado para outro paciente')
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /doctor/patients/:id — US-4.4
  // -------------------------------------------------------------------------

  describe('updatePatient', () => {
    const UPDATE_PATIENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'

    const makeUpdateDto = (overrides: Record<string, unknown> = {}) => ({
      name: 'Maria Atualizada',
      ...overrides,
    })

    const makeUpdatedPatient = (overrides: Record<string, unknown> = {}) => ({
      id: UPDATE_PATIENT_ID,
      name: 'Maria Atualizada',
      phone: '11999990000',
      email: 'maria@example.com',
      source: 'manual',
      status: 'active',
      created_at: new Date('2024-01-15T10:00:00Z'),
      ...overrides,
    })

    it('should call patientService.updatePatient with tenantId, patientId and body dto', async () => {
      const dto = makeUpdateDto()
      const updated = makeUpdatedPatient()
      service.updatePatient.mockResolvedValue(updated)

      const result = await controller.updatePatient(TENANT_ID, UPDATE_PATIENT_ID, dto)

      expect(service.updatePatient).toHaveBeenCalledWith(TENANT_ID, UPDATE_PATIENT_ID, dto)
      expect(result).toEqual(updated)
    })

    it('should return the service result directly', async () => {
      const dto = makeUpdateDto({ phone: '11900000001' })
      const updated = makeUpdatedPatient({ phone: '11900000001' })
      service.updatePatient.mockResolvedValue(updated)

      const result = await controller.updatePatient(TENANT_ID, UPDATE_PATIENT_ID, dto)

      expect(result).toBe(updated)
    })

    it('should propagate NotFoundException when patient is not found', async () => {
      service.updatePatient.mockRejectedValue(new NotFoundException('Paciente não encontrado'))

      await expect(
        controller.updatePatient(TENANT_ID, UPDATE_PATIENT_ID, makeUpdateDto()),
      ).rejects.toThrow(NotFoundException)
    })

    it('should propagate ConflictException when phone is already registered', async () => {
      service.updatePatient.mockRejectedValue(
        new ConflictException('Telefone já cadastrado para outro paciente'),
      )

      await expect(
        controller.updatePatient(TENANT_ID, UPDATE_PATIENT_ID, makeUpdateDto({ phone: '11999990000' })),
      ).rejects.toThrow(ConflictException)
    })
  })

  // -------------------------------------------------------------------------
  // GET /doctor/patients/:id/document — getDoctorPatientDocument
  // -------------------------------------------------------------------------

  describe('getDoctorPatientDocument', () => {
    const DOC_PATIENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892'

    it('should call getDoctorPatientDocument with tenantId and patientId', async () => {
      const expected = { document_type: 'cpf' as const, document: '12345678901' }
      service.getDoctorPatientDocument!.mockResolvedValue(expected)

      const result = await controller.getDoctorPatientDocument(TENANT_ID, DOC_PATIENT_ID)

      expect(service.getDoctorPatientDocument).toHaveBeenCalledWith(TENANT_ID, DOC_PATIENT_ID)
      expect(result).toEqual(expected)
    })

    it('should return null when patient has no document', async () => {
      service.getDoctorPatientDocument!.mockResolvedValue(null)

      const result = await controller.getDoctorPatientDocument(TENANT_ID, DOC_PATIENT_ID)

      expect(result).toBeNull()
    })

    it('should propagate NotFoundException when patient not found', async () => {
      service.getDoctorPatientDocument!.mockRejectedValue(
        new NotFoundException('Paciente não encontrado'),
      )

      await expect(
        controller.getDoctorPatientDocument(TENANT_ID, DOC_PATIENT_ID),
      ).rejects.toThrow(NotFoundException)
    })
  })
})
