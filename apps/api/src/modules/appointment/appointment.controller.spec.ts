/**
 * US-5.1 — Controller spec: AppointmentController (listAppointments)
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
import { AppointmentController } from './appointment.controller'
import { AppointmentService } from './appointment.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { RolesGuard } from '@/common/guards/roles.guard'

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

const makePaginatedResponse = (
  appointments: ReturnType<typeof makeAppointment>[],
  total = 1,
  page = 1,
  limit = 20,
) => ({
  data: appointments,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
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

describe('AppointmentController', () => {
  let controller: AppointmentController
  let service: jest.Mocked<AppointmentService>

  beforeEach(async () => {
    const mockService: jest.Mocked<Partial<AppointmentService>> = {
      listAppointments: jest.fn(),
      createAppointment: jest.fn(),
      updateAppointmentStatus: jest.fn(),
      getAppointmentDetail: jest.fn(),
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentController],
      providers: [
        { provide: AppointmentService, useValue: mockService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAllGuard)
      .overrideGuard(TenantGuard)
      .useValue(allowAllGuard)
      .overrideGuard(RolesGuard)
      .useValue(allowAllGuard)
      .compile()

    controller = moduleRef.get<AppointmentController>(AppointmentController)
    service = moduleRef.get(AppointmentService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // GET /doctor/appointments
  // -------------------------------------------------------------------------

  describe('listAppointments', () => {
    it('should call appointmentService.listAppointments with tenantId and default dto', async () => {
      const query = { page: 1, limit: 20 }
      const expected = makePaginatedResponse([makeAppointment()])
      service.listAppointments.mockResolvedValue(expected)

      const result = await controller.listAppointments(TENANT_ID, query)

      expect(service.listAppointments).toHaveBeenCalledWith(TENANT_ID, query)
      expect(result).toEqual(expected)
    })

    it('should pass status filter to the service', async () => {
      const query = { page: 1, limit: 20, status: 'scheduled' as const }
      const expected = makePaginatedResponse([makeAppointment({ status: 'scheduled' })])
      service.listAppointments.mockResolvedValue(expected)

      const result = await controller.listAppointments(TENANT_ID, query)

      expect(service.listAppointments).toHaveBeenCalledWith(TENANT_ID, query)
      expect(result).toEqual(expected)
    })

    it('should pass date filter to the service', async () => {
      const query = { page: 1, limit: 20, date: '2026-03-10' }
      const expected = makePaginatedResponse([makeAppointment()])
      service.listAppointments.mockResolvedValue(expected)

      const result = await controller.listAppointments(TENANT_ID, query)

      expect(service.listAppointments).toHaveBeenCalledWith(TENANT_ID, query)
      expect(result).toEqual(expected)
    })

    it('should pass patientId filter to the service', async () => {
      const query = { page: 1, limit: 20, patientId: PATIENT_ID }
      const expected = makePaginatedResponse([makeAppointment()])
      service.listAppointments.mockResolvedValue(expected)

      const result = await controller.listAppointments(TENANT_ID, query)

      expect(service.listAppointments).toHaveBeenCalledWith(TENANT_ID, query)
      expect(result).toEqual(expected)
    })

    it('should pass all filters simultaneously to the service', async () => {
      const query = {
        page: 1,
        limit: 10,
        status: 'in_progress' as const,
        date: '2026-03-10',
        patientId: PATIENT_ID,
      }
      const expected = makePaginatedResponse([makeAppointment({ status: 'in_progress' })], 1, 1, 10)
      service.listAppointments.mockResolvedValue(expected)

      const result = await controller.listAppointments(TENANT_ID, query)

      expect(service.listAppointments).toHaveBeenCalledWith(TENANT_ID, query)
      expect(result).toEqual(expected)
    })

    it('should return the service result directly', async () => {
      const appointments = [
        makeAppointment({ id: 'appt-uuid-1' }),
        makeAppointment({ id: 'appt-uuid-2', status: 'completed' }),
      ]
      const expected = makePaginatedResponse(appointments, 2)
      service.listAppointments.mockResolvedValue(expected)

      const result = await controller.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(result).toBe(expected)
    })

    it('should return empty list when service returns no results', async () => {
      const expected = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }
      service.listAppointments.mockResolvedValue(expected)

      const result = await controller.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(result.data).toEqual([])
      expect(result.pagination.total).toBe(0)
    })

    it('should forward the response with correct pagination shape', async () => {
      const expected = makePaginatedResponse([makeAppointment()], 1, 1, 20)
      service.listAppointments.mockResolvedValue(expected)

      const result = await controller.listAppointments(TENANT_ID, { page: 1, limit: 20 })

      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('pagination')
      expect(result.pagination).toHaveProperty('page')
      expect(result.pagination).toHaveProperty('limit')
      expect(result.pagination).toHaveProperty('total')
      expect(result.pagination).toHaveProperty('totalPages')
    })
  })

  // -------------------------------------------------------------------------
  // POST /doctor/appointments (US-5.2)
  // -------------------------------------------------------------------------

  describe('createAppointment', () => {
    const makeCreateDto = (overrides: Record<string, unknown> = {}) => ({
      patientId: PATIENT_ID,
      dateTime: '2026-03-15T10:00:00.000Z',
      durationMinutes: 30,
      ...overrides,
    })

    it('should call appointmentService.createAppointment with tenantId and dto', async () => {
      const dto = makeCreateDto()
      const expected = makeAppointment({ id: 'new-appt-uuid', status: 'scheduled' })
      service.createAppointment.mockResolvedValue(expected)

      const result = await controller.createAppointment(TENANT_ID, dto)

      expect(service.createAppointment).toHaveBeenCalledWith(TENANT_ID, dto)
      expect(result).toEqual(expected)
    })

    it('should return the service result directly', async () => {
      const dto = makeCreateDto()
      const expected = makeAppointment()
      service.createAppointment.mockResolvedValue(expected)

      const result = await controller.createAppointment(TENANT_ID, dto)

      expect(result).toBe(expected)
    })

    it('should pass dto without durationMinutes when omitted', async () => {
      const dto = { patientId: PATIENT_ID, dateTime: '2026-03-15T10:00:00.000Z' }
      const expected = makeAppointment()
      service.createAppointment.mockResolvedValue(expected)

      await controller.createAppointment(TENANT_ID, dto)

      expect(service.createAppointment).toHaveBeenCalledWith(TENANT_ID, dto)
    })

    it('should propagate NotFoundException from service', async () => {
      const { NotFoundException } = await import('@nestjs/common')
      const dto = makeCreateDto()
      service.createAppointment.mockRejectedValue(new NotFoundException('Paciente não encontrado'))

      await expect(controller.createAppointment(TENANT_ID, dto)).rejects.toThrow('Paciente não encontrado')
    })

    it('should propagate ConflictException from service', async () => {
      const { ConflictException } = await import('@nestjs/common')
      const dto = makeCreateDto()
      service.createAppointment.mockRejectedValue(
        new ConflictException('Conflito de horário: paciente já possui consulta no mesmo período'),
      )

      await expect(controller.createAppointment(TENANT_ID, dto)).rejects.toThrow(
        'Conflito de horário: paciente já possui consulta no mesmo período',
      )
    })
  })

  // -------------------------------------------------------------------------
  // DTO validation — UpdateAppointmentStatusSchema (CT-53-05)
  // -------------------------------------------------------------------------

  describe('UpdateAppointmentStatusSchema DTO validation', () => {
    let UpdateAppointmentStatusSchema: (typeof import('./dto/update-appointment-status.dto'))['UpdateAppointmentStatusSchema']

    beforeEach(async () => {
      ;({ UpdateAppointmentStatusSchema } = await import('./dto/update-appointment-status.dto'))
    })

    it('CT-53-05: should reject cancelled status without cancellationReason', () => {
      const result = UpdateAppointmentStatusSchema.safeParse({ status: 'cancelled' })
      expect(result.success).toBe(false)
    })

    it('CT-53-05b: should accept cancelled status with cancellationReason', () => {
      const result = UpdateAppointmentStatusSchema.safeParse({
        status: 'cancelled',
        cancellationReason: 'Paciente cancelou',
      })
      expect(result.success).toBe(true)
    })

    it('CT-53-05c: should reject rescheduled without newDateTime', () => {
      const result = UpdateAppointmentStatusSchema.safeParse({ status: 'rescheduled' })
      expect(result.success).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /doctor/appointments/:id/status (US-5.3)
  // -------------------------------------------------------------------------

  describe('updateAppointmentStatus', () => {
    const USER = { sub: 'doctor-uuid-1', type: 'doctor' as const, role: 'doctor' as const }

    it('should delegate to service with correct arguments', async () => {
      const dto = { status: 'waiting' as const }
      const expected = makeAppointment({ status: 'waiting' })
      service.updateAppointmentStatus.mockResolvedValue(expected)

      const result = await controller.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, USER, dto)

      expect(service.updateAppointmentStatus).toHaveBeenCalledWith(TENANT_ID, APPOINTMENT_ID, dto, USER.sub)
      expect(result).toBe(expected)
    })

    it('should pass actor id (sub) from JWT user', async () => {
      const user = { sub: 'different-doctor-uuid', type: 'doctor' as const, role: 'doctor' as const }
      const dto = { status: 'in_progress' as const }
      service.updateAppointmentStatus.mockResolvedValue(makeAppointment({ status: 'in_progress' }))

      await controller.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, user, dto)

      expect(service.updateAppointmentStatus).toHaveBeenCalledWith(TENANT_ID, APPOINTMENT_ID, dto, 'different-doctor-uuid')
    })

    it('should propagate NotFoundException from service', async () => {
      const { NotFoundException } = await import('@nestjs/common')
      service.updateAppointmentStatus.mockRejectedValue(new NotFoundException('Consulta não encontrada'))

      await expect(
        controller.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, USER, { status: 'waiting' }),
      ).rejects.toThrow('Consulta não encontrada')
    })

    it('should propagate BadRequestException from service on invalid transition', async () => {
      const { BadRequestException } = await import('@nestjs/common')
      service.updateAppointmentStatus.mockRejectedValue(
        new BadRequestException('Transição inválida: completed → in_progress'),
      )

      await expect(
        controller.updateAppointmentStatus(TENANT_ID, APPOINTMENT_ID, USER, { status: 'in_progress' as const }),
      ).rejects.toThrow('Transição inválida: completed → in_progress')
    })
  })

  // -------------------------------------------------------------------------
  // GET /doctor/appointments/:id (US-5.4)
  // -------------------------------------------------------------------------

  describe('getAppointmentDetail', () => {
    const makeDetailResponse = () => ({
      appointment: makeAppointment(),
      patient: {
        id: PATIENT_ID,
        name: 'João Silva',
        phone: '11999999999',
        email: 'joao@example.com',
        source: 'manual',
        status: 'active',
        portal_active: false,
        created_at: new Date('2026-02-01T09:00:00Z'),
      },
      clinicalNotes: [
        { id: 'note-uuid-1', content: 'Paciente apresentou melhora.', created_at: new Date() },
      ],
    })

    it('should call appointmentService.getAppointmentDetail with tenantId and appointmentId', async () => {
      const expected = makeDetailResponse()
      service.getAppointmentDetail.mockResolvedValue(expected)

      const result = await controller.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)

      expect(service.getAppointmentDetail).toHaveBeenCalledWith(TENANT_ID, APPOINTMENT_ID)
      expect(result).toBe(expected)
    })

    it('should forward tenantId and appointmentId correctly to the service', async () => {
      const OTHER_APPOINTMENT_ID = 'other-appt-uuid'
      const OTHER_TENANT_ID = 'other-tenant-uuid'
      const expected = makeDetailResponse()
      service.getAppointmentDetail.mockResolvedValue(expected)

      await controller.getAppointmentDetail(OTHER_TENANT_ID, OTHER_APPOINTMENT_ID)

      expect(service.getAppointmentDetail).toHaveBeenCalledWith(OTHER_TENANT_ID, OTHER_APPOINTMENT_ID)
    })

    it('should propagate NotFoundException from service', async () => {
      const { NotFoundException } = await import('@nestjs/common')
      service.getAppointmentDetail.mockRejectedValue(new NotFoundException('Consulta não encontrada'))

      await expect(controller.getAppointmentDetail(TENANT_ID, APPOINTMENT_ID)).rejects.toThrow(
        'Consulta não encontrada',
      )
    })
  })
})
