/**
 * US-8.1 — Editar Configurações do Agente
 *
 * Casos de teste cobertos:
 *  - CT-81-01: GET retorna campos corretos com tenant_id válido
 *  - CT-81-02: GET retorna 404 se agent_settings não encontrado para o tenant
 *  - CT-81-03: PATCH enabled=false retorna registro atualizado
 *  - CT-81-04: PATCH bookingMode='link' retorna registro atualizado
 *  - CT-81-05: PATCH welcomeMessage=null zera o campo
 *  - CT-81-06: PATCH com tenant_id de outro doutor (cross-tenant) → 404
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder encadeável do Knex
 *  - getAgentSettings: knex('agent_settings').select([...]).where({}).first()
 *  - updateAgentSettings: dois calls — primeiro .select('id').where({}).first() para verificar existência,
 *    depois .where({}).update({}).returning([...])
 */

// Mockar env ANTES de qualquer import que o carregue transitivamente.
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
import { AgentSettingsService } from './agent-settings.service'
import { NotFoundException } from '@nestjs/common'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-a1b2c3'
const OTHER_TENANT_ID = 'tenant-uuid-x9y8z7'

const mockAgentSettings = {
  id: 'agent-uuid-1',
  tenant_id: TENANT_ID,
  enabled: false,
  booking_mode: 'both',
  welcome_message: 'Olá! Como posso ajudar?',
  personality: 'Amigável e profissional',
  faq: 'P: Horário?\nR: 8h às 18h',
  appointment_rules: null,
  created_at: '2024-01-15T10:00:00.000Z',
  updated_at: '2024-01-15T10:00:00.000Z',
}

// ---------------------------------------------------------------------------
// Tipo auxiliar
// ---------------------------------------------------------------------------

type KnexMockFn = jest.Mock & { fn: { now: jest.Mock } }

// ---------------------------------------------------------------------------
// Helpers de builder Knex
// ---------------------------------------------------------------------------

/**
 * Builder para queries que terminam com .select([...]).where({}).first()
 * Usado em getAgentSettings.
 */
function buildSelectFirstBuilder(resolvedValue: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(resolvedValue),
  }
}

/**
 * Builder para queries que terminam com .select(['id']).where({}).first()
 * Usado na verificação de existência em updateAgentSettings.
 */
function buildExistenceCheckBuilder(resolvedValue: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(resolvedValue),
  }
}

/**
 * Builder para queries que terminam com .where({}).update({}).returning([...])
 * Usado na atualização em updateAgentSettings.
 */
function buildUpdateReturningBuilder(resolvedValue: unknown) {
  return {
    where: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([resolvedValue]),
  }
}

/**
 * Cria knexMock com fn.now() configurado.
 * Aceita builders como returnValues — cada chamada a knex('table') consome o próximo.
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

describe('AgentSettingsService', () => {
  let service: AgentSettingsService

  async function createModule(knex: KnexMockFn): Promise<AgentSettingsService> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AgentSettingsService,
        { provide: KNEX, useValue: knex },
      ],
    }).compile()

    return moduleRef.get<AgentSettingsService>(AgentSettingsService)
  }

  // -------------------------------------------------------------------------
  // getAgentSettings
  // -------------------------------------------------------------------------

  describe('getAgentSettings', () => {
    it('CT-81-01: retorna campos corretos mapeados em camelCase para tenant_id válido', async () => {
      const knexMock = buildKnexMock(buildSelectFirstBuilder(mockAgentSettings))
      service = await createModule(knexMock)

      const result = await service.getAgentSettings(TENANT_ID)

      expect(result.id).toBe(mockAgentSettings.id)
      expect(result.tenantId).toBe(TENANT_ID)
      expect(result.enabled).toBe(false)
      expect(result.bookingMode).toBe('both')
      expect(result.welcomeMessage).toBe(mockAgentSettings.welcome_message)
      expect(result.personality).toBe(mockAgentSettings.personality)
      expect(result.faq).toBe(mockAgentSettings.faq)
      expect(result.appointmentRules).toBeNull()
      expect(result.createdAt).toBe(mockAgentSettings.created_at)
      expect(result.updatedAt).toBe(mockAgentSettings.updated_at)
    })

    it('CT-81-02: lança NotFoundException se agent_settings não encontrado para o tenant', async () => {
      const knexMock = buildKnexMock(
        buildSelectFirstBuilder(undefined),
        buildSelectFirstBuilder(undefined),
      )
      service = await createModule(knexMock)

      await expect(service.getAgentSettings(TENANT_ID)).rejects.toThrow(NotFoundException)
      await expect(service.getAgentSettings(TENANT_ID)).rejects.toThrow(
        'Configurações do agente não encontradas',
      )
    })

    it('filtra apenas pelo tenant_id do JWT — não acessa dados de outros tenants', async () => {
      // Dois tenants distintos — cada um tem seus próprios dados
      const settingsTenantA = { ...mockAgentSettings, tenant_id: TENANT_ID, id: 'agent-a' }

      const knexMock = buildKnexMock(buildSelectFirstBuilder(settingsTenantA))
      service = await createModule(knexMock)

      const result = await service.getAgentSettings(TENANT_ID)

      // Garante que o WHERE foi chamado com o tenant_id correto
      const builder = knexMock.mock.results[0]?.value as ReturnType<typeof buildSelectFirstBuilder>
      expect(builder.where).toHaveBeenCalledWith({ tenant_id: TENANT_ID })
      expect(result.tenantId).toBe(TENANT_ID)
    })
  })

  // -------------------------------------------------------------------------
  // updateAgentSettings
  // -------------------------------------------------------------------------

  describe('updateAgentSettings', () => {
    it('CT-81-03: PATCH enabled=false retorna registro atualizado corretamente', async () => {
      const updatedRow = { ...mockAgentSettings, enabled: false }
      const existenceBuilder = buildExistenceCheckBuilder({ id: mockAgentSettings.id })
      const updateBuilder = buildUpdateReturningBuilder(updatedRow)

      const knexMock = buildKnexMock(existenceBuilder, updateBuilder)
      service = await createModule(knexMock)

      const result = await service.updateAgentSettings(TENANT_ID, { enabled: false })

      expect(result.enabled).toBe(false)
      expect(result.tenantId).toBe(TENANT_ID)
    })

    it('CT-81-04: PATCH bookingMode=link retorna registro atualizado com bookingMode correto', async () => {
      const updatedRow = { ...mockAgentSettings, booking_mode: 'link' }
      const existenceBuilder = buildExistenceCheckBuilder({ id: mockAgentSettings.id })
      const updateBuilder = buildUpdateReturningBuilder(updatedRow)

      const knexMock = buildKnexMock(existenceBuilder, updateBuilder)
      service = await createModule(knexMock)

      const result = await service.updateAgentSettings(TENANT_ID, { bookingMode: 'link' })

      expect(result.bookingMode).toBe('link')
    })

    it('CT-81-05: PATCH welcomeMessage=null zera o campo no registro retornado', async () => {
      const updatedRow = { ...mockAgentSettings, welcome_message: null }
      const existenceBuilder = buildExistenceCheckBuilder({ id: mockAgentSettings.id })
      const updateBuilder = buildUpdateReturningBuilder(updatedRow)

      const knexMock = buildKnexMock(existenceBuilder, updateBuilder)
      service = await createModule(knexMock)

      const result = await service.updateAgentSettings(TENANT_ID, { welcomeMessage: null })

      expect(result.welcomeMessage).toBeNull()
    })

    it('CT-81-06: PATCH com tenant_id de outro doutor (cross-tenant) lança NotFoundException', async () => {
      // Para o OTHER_TENANT_ID, não existe registro — simula tentativa cross-tenant
      const existenceBuilder = buildExistenceCheckBuilder(undefined)

      const knexMock = buildKnexMock(existenceBuilder)
      service = await createModule(knexMock)

      await expect(
        service.updateAgentSettings(OTHER_TENANT_ID, { enabled: true }),
      ).rejects.toThrow(NotFoundException)
    })

    it('PATCH com body vazio não altera nenhum campo além de updated_at', async () => {
      const unchangedRow = { ...mockAgentSettings }
      const existenceBuilder = buildExistenceCheckBuilder({ id: mockAgentSettings.id })
      const updateBuilder = buildUpdateReturningBuilder(unchangedRow)

      const knexMock = buildKnexMock(existenceBuilder, updateBuilder)
      service = await createModule(knexMock)

      const result = await service.updateAgentSettings(TENANT_ID, {})

      // Resultado deve ser idêntico ao estado anterior (nenhum campo foi alterado)
      expect(result.enabled).toBe(mockAgentSettings.enabled)
      expect(result.bookingMode).toBe(mockAgentSettings.booking_mode)
      expect(result.welcomeMessage).toBe(mockAgentSettings.welcome_message)

      // O updateData deve conter apenas updated_at
      const callArg = updateBuilder.update.mock.calls[0][0] as Record<string, unknown>
      expect(callArg).not.toHaveProperty('enabled')
      expect(callArg).not.toHaveProperty('booking_mode')
      expect(callArg).not.toHaveProperty('welcome_message')
      expect(callArg).toHaveProperty('updated_at')
    })

    it('PATCH só inclui no updateData os campos definidos no dto', async () => {
      const updatedRow = { ...mockAgentSettings, enabled: true, booking_mode: 'chat' }
      const existenceBuilder = buildExistenceCheckBuilder({ id: mockAgentSettings.id })
      const updateBuilder = buildUpdateReturningBuilder(updatedRow)

      const knexMock = buildKnexMock(existenceBuilder, updateBuilder)
      service = await createModule(knexMock)

      await service.updateAgentSettings(TENANT_ID, { enabled: true, bookingMode: 'chat' })

      const callArg = updateBuilder.update.mock.calls[0][0] as Record<string, unknown>
      expect(callArg).toHaveProperty('enabled', true)
      expect(callArg).toHaveProperty('booking_mode', 'chat')
      expect(callArg).not.toHaveProperty('welcome_message')
      expect(callArg).not.toHaveProperty('personality')
      expect(callArg).not.toHaveProperty('faq')
      expect(callArg).not.toHaveProperty('appointment_rules')
    })

    it('lança NotFoundException se agent_settings não encontrado antes do update', async () => {
      const knexMock = buildKnexMock(
        buildExistenceCheckBuilder(undefined),
        buildExistenceCheckBuilder(undefined),
      )
      service = await createModule(knexMock)

      await expect(
        service.updateAgentSettings(TENANT_ID, { enabled: true }),
      ).rejects.toThrow(NotFoundException)
      await expect(
        service.updateAgentSettings(TENANT_ID, { enabled: true }),
      ).rejects.toThrow('Configurações do agente não encontradas')
    })
  })
})
