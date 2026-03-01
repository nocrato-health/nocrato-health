/**
 * US-3.1 — Wizard de Onboarding do Doutor
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder encadeável do Knex
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - O service usa .update(data).returning([...]) — o terminal é .returning()
 *  - O service usa .insert(data).returning([...]) — o terminal é .returning()
 *  - Para upsert de agent_settings: testamos o caminho de UPDATE (exists) e INSERT (não existe)
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
import { OnboardingService } from './onboarding.service'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Dados de fixture
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-1'

const mockDoctor = {
  id: 'doctor-uuid-1',
  tenant_id: TENANT_ID,
  email: 'dr.silva@example.com',
  name: 'Dr. Silva',
  specialty: 'Cardiologia',
  phone: null,
  crm: '12345',
  crm_state: 'SP',
  working_hours: { monday: [{ start: '08:00', end: '12:00' }] },
  timezone: 'America/Sao_Paulo',
  appointment_duration: 30,
  onboarding_completed: false,
  status: 'active',
}

const mockTenant = {
  id: TENANT_ID,
  slug: 'dr-silva',
  name: 'Dr. Silva',
  primary_color: '#0066CC',
  logo_url: null,
}

const mockAgentSettings = {
  id: 'agent-uuid-1',
  tenant_id: TENANT_ID,
  welcome_message: 'Olá! Como posso ajudar?',
  personality: null,
  faq: null,
  enabled: false,
  booking_mode: 'both',
  appointment_rules: null,
}

// ---------------------------------------------------------------------------
// Tipo auxiliar para o Knex mock
// ---------------------------------------------------------------------------

type KnexMockFn = jest.Mock & { fn: { now: jest.Mock } }

// ---------------------------------------------------------------------------
// Helpers para construir builders encadeáveis do Knex
// ---------------------------------------------------------------------------

/**
 * Builder para queries que terminam com .where().first()
 * Cadeia: knex('table').where({...}).first()
 */
function buildFirstBuilder(resolvedValue: unknown) {
  return {
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(resolvedValue),
  }
}

/**
 * Builder para queries que terminam com .where().update().returning()
 * Cadeia: knex('table').where({...}).update({...}).returning([...])
 * .update() retorna this (encadeável), .returning() é o terminal.
 */
function buildUpdateReturningBuilder(resolvedValue: unknown) {
  return {
    where: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([resolvedValue]),
  }
}

/**
 * Builder para queries que terminam com .insert().returning()
 * Cadeia: knex('table').insert({...}).returning([...])
 * .insert() retorna this (encadeável), .returning() é o terminal.
 */
function buildInsertReturningBuilder(resolvedValue: unknown) {
  return {
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([resolvedValue]),
  }
}

/**
 * Builder para .where().update() sem returning (terminal é update — retorna número)
 */
function buildUpdateOnlyBuilder(resolvedValue: number = 1) {
  return {
    where: jest.fn().mockReturnThis(),
    update: jest.fn().mockResolvedValue(resolvedValue),
  }
}

/**
 * Cria knexMock com fn.now() configurado.
 */
function buildKnexMock(...returnValues: unknown[]): KnexMockFn {
  const mockFn = jest.fn() as KnexMockFn
  for (const val of returnValues) {
    mockFn.mockReturnValueOnce(val)
  }
  mockFn.fn = { now: jest.fn().mockReturnValue('NOW()') }
  return mockFn
}

// ---------------------------------------------------------------------------
// Suite de testes
// ---------------------------------------------------------------------------

describe('OnboardingService', () => {
  let service: OnboardingService
  let knexMock: KnexMockFn

  async function createModule(knex: KnexMockFn) {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: KNEX, useValue: knex },
      ],
    }).compile()

    return moduleRef.get<OnboardingService>(OnboardingService)
  }

  // -------------------------------------------------------------------------
  // getOnboardingStatus
  // -------------------------------------------------------------------------

  describe('getOnboardingStatus', () => {
    it('should return currentStep=5 and completed=true when all steps are done', async () => {
      knexMock = buildKnexMock(
        buildFirstBuilder(mockDoctor),          // doctors.where().first()
        buildFirstBuilder(mockAgentSettings),   // agent_settings.where().first()
      )
      service = await createModule(knexMock)

      const result = await service.getOnboardingStatus(TENANT_ID)

      expect(result.completed).toBe(true)
      expect(result.currentStep).toBe(5)
      expect(result.steps.profile).toBe(true)
      expect(result.steps.schedule).toBe(true)
      expect(result.steps.branding).toBe(true)
      expect(result.steps.agent).toBe(true)
    })

    it('should return currentStep=1 when profile (name/crm) is incomplete', async () => {
      const doctorNoProfile = { ...mockDoctor, name: null, crm: null }
      knexMock = buildKnexMock(
        buildFirstBuilder(doctorNoProfile),
        buildFirstBuilder(mockAgentSettings),
      )
      service = await createModule(knexMock)

      const result = await service.getOnboardingStatus(TENANT_ID)

      expect(result.completed).toBe(false)
      expect(result.currentStep).toBe(1)
      expect(result.steps.profile).toBe(false)
    })

    it('should return currentStep=2 when profile is done but schedule is not', async () => {
      const doctorNoSchedule = { ...mockDoctor, working_hours: null }
      knexMock = buildKnexMock(
        buildFirstBuilder(doctorNoSchedule),
        buildFirstBuilder(mockAgentSettings),
      )
      service = await createModule(knexMock)

      const result = await service.getOnboardingStatus(TENANT_ID)

      expect(result.currentStep).toBe(2)
      expect(result.steps.profile).toBe(true)
      expect(result.steps.schedule).toBe(false)
    })

    it('should return currentStep=2 when working_hours is an empty object (BUG-02)', async () => {
      // working_hours: {} is truthy in JS but has no keys — should NOT be treated as complete
      const doctorEmptySchedule = { ...mockDoctor, working_hours: {} }
      knexMock = buildKnexMock(
        buildFirstBuilder(doctorEmptySchedule),
        buildFirstBuilder(mockAgentSettings),
      )
      service = await createModule(knexMock)

      const result = await service.getOnboardingStatus(TENANT_ID)

      expect(result.currentStep).toBe(2)
      expect(result.steps.profile).toBe(true)
      expect(result.steps.schedule).toBe(false)
    })

    it('should return currentStep=4 when agent welcome_message is null', async () => {
      const agentNoWelcome = { ...mockAgentSettings, welcome_message: null }
      knexMock = buildKnexMock(
        buildFirstBuilder(mockDoctor),
        buildFirstBuilder(agentNoWelcome),
      )
      service = await createModule(knexMock)

      const result = await service.getOnboardingStatus(TENANT_ID)

      expect(result.currentStep).toBe(4)
      expect(result.steps.agent).toBe(false)
    })

    it('should return currentStep=4 when agent_settings does not exist', async () => {
      knexMock = buildKnexMock(
        buildFirstBuilder(mockDoctor),
        buildFirstBuilder(undefined),  // sem agent_settings
      )
      service = await createModule(knexMock)

      const result = await service.getOnboardingStatus(TENANT_ID)

      expect(result.currentStep).toBe(4)
      expect(result.steps.agent).toBe(false)
    })

    it('should throw NotFoundException when doctor does not exist', async () => {
      knexMock = buildKnexMock(
        buildFirstBuilder(undefined),  // doctor não encontrado
      )
      service = await createModule(knexMock)

      await expect(service.getOnboardingStatus(TENANT_ID)).rejects.toThrow(NotFoundException)
    })

    it('should always set steps.branding to true', async () => {
      knexMock = buildKnexMock(
        buildFirstBuilder(mockDoctor),
        buildFirstBuilder(mockAgentSettings),
      )
      service = await createModule(knexMock)

      const result = await service.getOnboardingStatus(TENANT_ID)

      expect(result.steps.branding).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // updateProfile
  // -------------------------------------------------------------------------

  describe('updateProfile', () => {
    const dto = {
      name: 'Dr. Carlos Silva',
      specialty: 'Cardiologia',
      phone: '11999990000',
      crm: '54321',
      crmState: 'RJ',
    }

    it('should update and return the doctor', async () => {
      const updatedDoctor = { ...mockDoctor, name: dto.name, crm: dto.crm, crm_state: dto.crmState }
      knexMock = buildKnexMock(buildUpdateReturningBuilder(updatedDoctor))
      service = await createModule(knexMock)

      const result = await service.updateProfile(TENANT_ID, dto)

      expect(result.name).toBe(dto.name)
      expect(result.crm).toBe(dto.crm)
      expect(result.crm_state).toBe(dto.crmState)
    })

    it('should throw NotFoundException when doctor is not found (empty returning)', async () => {
      const builder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([undefined]),
      }
      knexMock = buildKnexMock(builder)
      service = await createModule(knexMock)

      await expect(service.updateProfile(TENANT_ID, dto)).rejects.toThrow(NotFoundException)
    })

    it('should call update with null for specialty and phone when not provided', async () => {
      const dtoWithout = { name: 'Dr. Silva', crm: '12345', crmState: 'SP' }
      const builder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ ...mockDoctor, specialty: null, phone: null }]),
      }
      knexMock = buildKnexMock(builder)
      service = await createModule(knexMock)

      const result = await service.updateProfile(TENANT_ID, dtoWithout)

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ specialty: null, phone: null }),
      )
      expect(result.specialty).toBeNull()
      expect(result.phone).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // updateSchedule
  // -------------------------------------------------------------------------

  describe('updateSchedule', () => {
    const dto = {
      workingHours: { monday: [{ start: '08:00', end: '12:00' }] },
      timezone: 'America/Recife',
      appointmentDuration: 45,
    }

    it('should update working_hours, timezone and appointment_duration', async () => {
      const updatedDoctor = {
        ...mockDoctor,
        working_hours: dto.workingHours,
        timezone: 'America/Recife',
        appointment_duration: 45,
      }
      knexMock = buildKnexMock(buildUpdateReturningBuilder(updatedDoctor))
      service = await createModule(knexMock)

      const result = await service.updateSchedule(TENANT_ID, dto)

      expect(result.timezone).toBe('America/Recife')
      expect(result.appointment_duration).toBe(45)
    })

    it('should NOT include timezone/appointment_duration in update when not provided', async () => {
      const dtoMin = { workingHours: { friday: [{ start: '14:00', end: '18:00' }] } }
      const builder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ ...mockDoctor }]),
      }
      knexMock = buildKnexMock(builder)
      service = await createModule(knexMock)

      await service.updateSchedule(TENANT_ID, dtoMin)

      const callArg = builder.update.mock.calls[0][0] as Record<string, unknown>
      expect(callArg).not.toHaveProperty('timezone')
      expect(callArg).not.toHaveProperty('appointment_duration')
    })

    it('should throw NotFoundException when doctor is not found', async () => {
      const builder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([undefined]),
      }
      knexMock = buildKnexMock(builder)
      service = await createModule(knexMock)

      await expect(service.updateSchedule(TENANT_ID, dto)).rejects.toThrow(NotFoundException)
    })
  })

  // -------------------------------------------------------------------------
  // updateBranding
  // -------------------------------------------------------------------------

  describe('updateBranding', () => {
    const dto = { primaryColor: '#FF5500', logoUrl: 'https://example.com/logo.png' }

    it('should update tenants table and return branding fields', async () => {
      const updatedTenant = { ...mockTenant, primary_color: '#FF5500', logo_url: dto.logoUrl }
      knexMock = buildKnexMock(buildUpdateReturningBuilder(updatedTenant))
      service = await createModule(knexMock)

      const result = await service.updateBranding(TENANT_ID, dto)

      expect(result.primary_color).toBe('#FF5500')
      expect(result.logo_url).toBe(dto.logoUrl)
    })

    it('should NOT include primary_color/logo_url in update when not in dto', async () => {
      const dtoEmpty = {}
      const builder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockTenant]),
      }
      knexMock = buildKnexMock(builder)
      service = await createModule(knexMock)

      await service.updateBranding(TENANT_ID, dtoEmpty)

      const callArg = builder.update.mock.calls[0][0] as Record<string, unknown>
      expect(callArg).not.toHaveProperty('primary_color')
      expect(callArg).not.toHaveProperty('logo_url')
    })

    it('should throw NotFoundException when tenant is not found', async () => {
      const builder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([undefined]),
      }
      knexMock = buildKnexMock(builder)
      service = await createModule(knexMock)

      await expect(service.updateBranding(TENANT_ID, dto)).rejects.toThrow(NotFoundException)
    })
  })

  // -------------------------------------------------------------------------
  // updateAgentSettings
  // -------------------------------------------------------------------------

  describe('updateAgentSettings', () => {
    const dto = {
      welcomeMessage: 'Bem-vindo ao consultório!',
      personality: 'Amigável e profissional',
      faq: 'P: Qual o horário?\nR: 8h às 18h',
    }

    it('should UPDATE existing agent_settings when record exists', async () => {
      const updatedAgent = { ...mockAgentSettings, welcome_message: dto.welcomeMessage }
      const firstBuilder = buildFirstBuilder(mockAgentSettings)   // existing record found
      const updateBuilder = buildUpdateReturningBuilder(updatedAgent)

      knexMock = buildKnexMock(firstBuilder, updateBuilder)
      service = await createModule(knexMock)

      const result = await service.updateAgentSettings(TENANT_ID, dto)

      expect(result.welcome_message).toBe(dto.welcomeMessage)
      expect(firstBuilder.first).toHaveBeenCalled()
    })

    it('should INSERT new agent_settings with enabled=false and booking_mode=both when record does not exist', async () => {
      const newAgent = {
        id: 'new-agent-uuid',
        tenant_id: TENANT_ID,
        welcome_message: dto.welcomeMessage,
        personality: dto.personality ?? null,
        faq: dto.faq ?? null,
        enabled: false,
        booking_mode: 'both',
        appointment_rules: null,
      }
      const firstBuilder = buildFirstBuilder(undefined)  // no existing record
      const insertBuilder = buildInsertReturningBuilder(newAgent)

      knexMock = buildKnexMock(firstBuilder, insertBuilder)
      service = await createModule(knexMock)

      const result = await service.updateAgentSettings(TENANT_ID, dto)

      expect(result.enabled).toBe(false)
      expect(result.booking_mode).toBe('both')
      expect(result.welcome_message).toBe(dto.welcomeMessage)
    })

    it('should call insert with tenant_id, enabled=false, booking_mode=both', async () => {
      const newAgent = {
        id: 'new-uuid',
        tenant_id: TENANT_ID,
        welcome_message: 'Hello',
        personality: null,
        faq: null,
        enabled: false,
        booking_mode: 'both',
        appointment_rules: null,
      }
      const firstBuilder = buildFirstBuilder(undefined)
      const insertBuilder = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([newAgent]),
      }
      knexMock = buildKnexMock(firstBuilder, insertBuilder)
      service = await createModule(knexMock)

      await service.updateAgentSettings(TENANT_ID, { welcomeMessage: 'Hello' })

      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          enabled: false,
          booking_mode: 'both',
        }),
      )
    })

    it('should NOT include personality/faq in update when not provided', async () => {
      const dtoMin = { welcomeMessage: 'Olá!' }
      const updateBuilder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ ...mockAgentSettings, welcome_message: 'Olá!' }]),
      }

      knexMock = buildKnexMock(buildFirstBuilder(mockAgentSettings), updateBuilder)
      service = await createModule(knexMock)

      await service.updateAgentSettings(TENANT_ID, dtoMin)

      const callArg = updateBuilder.update.mock.calls[0][0] as Record<string, unknown>
      expect(callArg).not.toHaveProperty('personality')
      expect(callArg).not.toHaveProperty('faq')
    })
  })

  // -------------------------------------------------------------------------
  // completeOnboarding
  // -------------------------------------------------------------------------

  describe('completeOnboarding', () => {
    it('should mark onboarding_completed=true and return doctor info', async () => {
      const firstBuilder = buildFirstBuilder(mockDoctor)   // doctor with name, crm, working_hours
      const updateBuilder = buildUpdateOnlyBuilder(1)

      knexMock = buildKnexMock(firstBuilder, updateBuilder)
      service = await createModule(knexMock)

      const result = await service.completeOnboarding(TENANT_ID)

      expect(result.success).toBe(true)
      expect(result.doctor.id).toBe(mockDoctor.id)
      expect(result.doctor.tenantId).toBe(TENANT_ID)
      expect(result.doctor.email).toBe(mockDoctor.email)
      expect(result.doctor.name).toBe(mockDoctor.name)
      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ onboarding_completed: true }),
      )
    })

    it('should throw NotFoundException when doctor is not found', async () => {
      knexMock = buildKnexMock(buildFirstBuilder(undefined))
      service = await createModule(knexMock)

      await expect(service.completeOnboarding(TENANT_ID)).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when name is null (profile incomplete)', async () => {
      const doctorNoName = { ...mockDoctor, name: null }
      knexMock = buildKnexMock(buildFirstBuilder(doctorNoName))
      service = await createModule(knexMock)

      await expect(service.completeOnboarding(TENANT_ID)).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when crm is null (profile incomplete)', async () => {
      const doctorNoCrm = { ...mockDoctor, crm: null }
      knexMock = buildKnexMock(buildFirstBuilder(doctorNoCrm))
      service = await createModule(knexMock)

      await expect(service.completeOnboarding(TENANT_ID)).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when working_hours is null (schedule incomplete)', async () => {
      const doctorNoSchedule = { ...mockDoctor, working_hours: null }
      knexMock = buildKnexMock(buildFirstBuilder(doctorNoSchedule))
      service = await createModule(knexMock)

      await expect(service.completeOnboarding(TENANT_ID)).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when working_hours is an empty object (BUG-02)', async () => {
      // working_hours: {} is truthy in JS but has no configured days — must reject
      const doctorEmptySchedule = { ...mockDoctor, working_hours: {} }
      knexMock = buildKnexMock(buildFirstBuilder(doctorEmptySchedule))
      service = await createModule(knexMock)

      await expect(service.completeOnboarding(TENANT_ID)).rejects.toThrow(BadRequestException)
    })
  })
})
