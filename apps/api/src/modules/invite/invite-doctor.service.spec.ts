/**
 * US-1.4 — Convidar Doutor
 * Testes unitários para InviteService.inviteDoctor
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder do Knex com chaining
 *  - EmailService: mock com jest.fn() para sendInviteDoctor()
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - crypto: mock de módulo para controlar randomBytes() e garantir token previsível
 */

// Mockar env ANTES de qualquer import que o carregue transitivamente.
// env.ts chama process.exit(1) se vars estiverem ausentes — não pode rodar em testes.
jest.mock('@/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-16-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    RESEND_API_KEY: 'test-resend-key',
    EMAIL_FROM: 'noreply@test.com',
    FRONTEND_URL: 'http://localhost:5173',
  },
}))

jest.mock('bcrypt')

import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException } from '@nestjs/common'

import { InviteService } from './invite.service'
import { EmailService } from '@/modules/email/email.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface MockKnexBuilder {
  where: jest.Mock
  whereNot: jest.Mock
  first: jest.Mock
  insert: jest.Mock
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INVITE_EMAIL = 'dr.silva@example.com'
const INVITED_BY = 'member-uuid-001'

const EXISTING_DOCTOR = {
  id: 'doctor-uuid-001',
  email: INVITE_EMAIL,
  status: 'active' as const,
}

const EXISTING_INVITE = {
  id: 'invite-uuid-001',
  type: 'doctor' as const,
  email: INVITE_EMAIL,
  token: 'existing-token',
  status: 'pending' as const,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
}

const INVITER_MEMBER = {
  id: INVITED_BY,
  email: 'admin@nocrato.com',
  name: 'Admin Nocrato',
  role: 'agency_admin' as const,
  status: 'active' as const,
}

// ---------------------------------------------------------------------------
// Factory de mock do Knex para inviteDoctor
// ---------------------------------------------------------------------------
// inviteDoctor faz 4 queries:
//   1. knex('doctors').where({ email }).first()                          → check existingDoctor
//   2. knex('invites').where({ email, type, status }).first()            → check existingInvite
//   3. knex('agency_members').where({ id: invitedBy }).first()          → busca inviter
//   4. knex('invites').insert({ ... })                                   → cria invite
// Cada chamada ao mockKnexFn() retorna um builder; usamos mockReturnValueOnce para sequenciar.

function buildBuilder(firstReturn: unknown): MockKnexBuilder {
  const builder: MockKnexBuilder = {
    where: jest.fn().mockReturnThis(),
    whereNot: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(firstReturn),
    insert: jest.fn().mockResolvedValue([1]),
  }
  return builder
}

// ---------------------------------------------------------------------------
// Helper para criar o módulo de testes
// ---------------------------------------------------------------------------

async function createModule(knexFn: jest.Mock): Promise<{
  service: InviteService
  emailService: EmailService
}> {
  const mockEmailService = {
    sendInviteDoctor: jest.fn().mockResolvedValue(undefined),
    sendInviteMember: jest.fn().mockResolvedValue(undefined),
  }

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      InviteService,
      { provide: KNEX, useValue: knexFn },
      { provide: EmailService, useValue: mockEmailService },
    ],
  }).compile()

  return {
    service: module.get<InviteService>(InviteService),
    emailService: module.get<EmailService>(EmailService),
  }
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('US-1.4 — InviteService.inviteDoctor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('Happy path', () => {
    it('should return { message: "Convite enviado com sucesso" } para email novo sem convite pendente', async () => {
      const doctorBuilder = buildBuilder(undefined)   // nenhum doutor existente
      const inviteBuilder = buildBuilder(undefined)   // nenhum invite pendente
      const inviterBuilder = buildBuilder(INVITER_MEMBER) // inviter encontrado
      const insertBuilder = buildBuilder(undefined)

      const mockKnexFn = jest.fn()
        .mockReturnValueOnce(doctorBuilder)   // knex('doctors')
        .mockReturnValueOnce(inviteBuilder)   // knex('invites') — check pendente
        .mockReturnValueOnce(inviterBuilder)  // knex('agency_members') — inviter
        .mockReturnValueOnce(insertBuilder)   // knex('invites') — insert

      insertBuilder.insert = jest.fn().mockResolvedValue([1])

      const { service } = await createModule(mockKnexFn)
      const result = await service.inviteDoctor(INVITE_EMAIL, INVITED_BY)

      expect(result).toEqual({ message: 'Convite enviado com sucesso' })
    })

    it('should call emailService.sendInviteDoctor with to, token and invitedByName', async () => {
      const doctorBuilder = buildBuilder(undefined)
      const inviteBuilder = buildBuilder(undefined)
      const inviterBuilder = buildBuilder(INVITER_MEMBER)
      const insertBuilder = buildBuilder(undefined)

      insertBuilder.insert = jest.fn().mockResolvedValue([1])

      const mockKnexFn = jest.fn()
        .mockReturnValueOnce(doctorBuilder)
        .mockReturnValueOnce(inviteBuilder)
        .mockReturnValueOnce(inviterBuilder)
        .mockReturnValueOnce(insertBuilder)

      const { service, emailService } = await createModule(mockKnexFn)
      await service.inviteDoctor(INVITE_EMAIL, INVITED_BY)

      expect(emailService.sendInviteDoctor).toHaveBeenCalledTimes(1)
      expect(emailService.sendInviteDoctor).toHaveBeenCalledWith(
        expect.objectContaining({
          to: INVITE_EMAIL,
          invitedByName: INVITER_MEMBER.name,
          token: expect.any(String),
        }),
      )
    })

    it('should use "Um administrador" as invitedByName when inviter is not found', async () => {
      const doctorBuilder = buildBuilder(undefined)
      const inviteBuilder = buildBuilder(undefined)
      const inviterBuilder = buildBuilder(undefined)  // inviter não encontrado
      const insertBuilder = buildBuilder(undefined)
      insertBuilder.insert = jest.fn().mockResolvedValue([1])

      const mockKnexFn = jest.fn()
        .mockReturnValueOnce(doctorBuilder)
        .mockReturnValueOnce(inviteBuilder)
        .mockReturnValueOnce(inviterBuilder)
        .mockReturnValueOnce(insertBuilder)

      const { service, emailService } = await createModule(mockKnexFn)
      await service.inviteDoctor(INVITE_EMAIL, INVITED_BY)

      expect(emailService.sendInviteDoctor).toHaveBeenCalledWith(
        expect.objectContaining({ invitedByName: 'Um administrador' }),
      )
    })

    it('should insert invite with type "doctor" and status "pending"', async () => {
      const doctorBuilder = buildBuilder(undefined)
      const inviteBuilder = buildBuilder(undefined)
      const inviterBuilder = buildBuilder(INVITER_MEMBER)
      const insertBuilder = buildBuilder(undefined)

      let capturedInsert: Record<string, unknown> | null = null
      insertBuilder.insert = jest.fn().mockImplementation((payload) => {
        capturedInsert = payload
        return Promise.resolve([1])
      })

      const mockKnexFn = jest.fn()
        .mockReturnValueOnce(doctorBuilder)
        .mockReturnValueOnce(inviteBuilder)
        .mockReturnValueOnce(inviterBuilder)
        .mockReturnValueOnce(insertBuilder)

      const { service } = await createModule(mockKnexFn)
      await service.inviteDoctor(INVITE_EMAIL, INVITED_BY)

      expect(capturedInsert).toMatchObject({
        type: 'doctor',
        email: INVITE_EMAIL,
        invited_by: INVITED_BY,
        status: 'pending',
      })
      expect(capturedInsert!['token']).toBeDefined()
      expect(capturedInsert!['expires_at']).toBeInstanceOf(Date)
    })
  })

  // -------------------------------------------------------------------------
  // Casos de erro
  // -------------------------------------------------------------------------

  describe('Erro: email já cadastrado como doutor', () => {
    it('should throw ConflictException("Este email já está cadastrado como doutor")', async () => {
      const doctorBuilder = buildBuilder(EXISTING_DOCTOR)

      const mockKnexFn = jest.fn().mockReturnValue(doctorBuilder)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.inviteDoctor(INVITE_EMAIL, INVITED_BY),
      ).rejects.toThrow(new ConflictException('Este email já está cadastrado como doutor'))
    })

    it('should not check for pending invite when doctor already exists', async () => {
      const doctorBuilder = buildBuilder(EXISTING_DOCTOR)

      const mockKnexFn = jest.fn().mockReturnValue(doctorBuilder)

      const { service } = await createModule(mockKnexFn)

      await expect(service.inviteDoctor(INVITE_EMAIL, INVITED_BY)).rejects.toThrow(
        ConflictException,
      )

      // Apenas 1 chamada ao knex — só a query de doctors foi feita
      expect(mockKnexFn).toHaveBeenCalledTimes(1)
    })

    it('should not send email when doctor already exists', async () => {
      const doctorBuilder = buildBuilder(EXISTING_DOCTOR)
      const mockKnexFn = jest.fn().mockReturnValue(doctorBuilder)

      const { service, emailService } = await createModule(mockKnexFn)

      await expect(service.inviteDoctor(INVITE_EMAIL, INVITED_BY)).rejects.toThrow(
        ConflictException,
      )

      expect(emailService.sendInviteDoctor).not.toHaveBeenCalled()
    })
  })

  describe('Erro: convite pendente já existe', () => {
    it('should throw ConflictException("Já existe um convite pendente para este email")', async () => {
      const doctorBuilder = buildBuilder(undefined)      // nenhum doutor
      const inviteBuilder = buildBuilder(EXISTING_INVITE) // convite pendente existe

      const mockKnexFn = jest.fn()
        .mockReturnValueOnce(doctorBuilder)
        .mockReturnValueOnce(inviteBuilder)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.inviteDoctor(INVITE_EMAIL, INVITED_BY),
      ).rejects.toThrow(new ConflictException('Já existe um convite pendente para este email'))
    })

    it('should not send email when pending invite already exists', async () => {
      const doctorBuilder = buildBuilder(undefined)
      const inviteBuilder = buildBuilder(EXISTING_INVITE)

      const mockKnexFn = jest.fn()
        .mockReturnValueOnce(doctorBuilder)
        .mockReturnValueOnce(inviteBuilder)

      const { service, emailService } = await createModule(mockKnexFn)

      await expect(service.inviteDoctor(INVITE_EMAIL, INVITED_BY)).rejects.toThrow(
        ConflictException,
      )

      expect(emailService.sendInviteDoctor).not.toHaveBeenCalled()
    })
  })
})
