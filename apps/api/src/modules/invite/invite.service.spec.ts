/**
 * US-1.2 — Convidar membro da agência (inviteAgencyMember)
 * US-1.3 — Validar e aceitar convite de membro da agência (validateInviteToken / acceptInvite)
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando query builder encadeável do Knex
 *  - EmailService: mock manual com jest.fn()
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - bcrypt: mock de módulo para controlar hash() sem computação real
 *  - crypto: NÃO mockado — randomBytes é chamado internamente, verificamos apenas o formato
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
    FRONTEND_URL: 'http://localhost:5173',
    EMAIL_FROM: 'no-reply@nocrato.com',
  },
}))

jest.mock('bcrypt')

import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'

import { InviteService } from './invite.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface MockKnexBuilder {
  where: jest.Mock
  whereNot: jest.Mock
  first: jest.Mock
  insert: jest.Mock
  update: jest.Mock
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTIVE_MEMBER = {
  id: 'member-uuid-001',
  email: 'admin@nocrato.com',
  name: 'Admin Nocrato',
  password_hash: '$2b$10$hashedpassword',
  role: 'agency_admin' as const,
  status: 'active' as const,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
}

const INVITER = {
  id: 'inviter-uuid-001',
  email: 'admin@nocrato.com',
  name: 'Admin Nocrato',
  role: 'agency_admin' as const,
  status: 'active' as const,
}

const PENDING_INVITE = {
  id: 'invite-uuid-001',
  type: 'agency_member' as const,
  email: 'novo@nocrato.com',
  invited_by: INVITER.id,
  token: 'a'.repeat(64),
  status: 'pending' as const,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias no futuro
  accepted_at: null,
  metadata: {},
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
}

const ACCEPTED_INVITE = {
  ...PENDING_INVITE,
  status: 'accepted' as const,
  accepted_at: new Date('2025-01-05'),
}

const EXPIRED_INVITE = {
  ...PENDING_INVITE,
  status: 'pending' as const,
  expires_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 dia no passado
}

// ---------------------------------------------------------------------------
// Mocks auxiliares
// ---------------------------------------------------------------------------

const mockEmailService = {
  sendInviteMember: jest.fn().mockResolvedValue(undefined),
}

// ---------------------------------------------------------------------------
// Factories de mock do Knex
// ---------------------------------------------------------------------------

/**
 * Constrói um builder encadeável genérico.
 * Todos os métodos retornam `this` exceto os terminais (first, insert, update).
 */
function buildQueryBuilder(firstReturn: unknown = undefined): MockKnexBuilder {
  const builder: MockKnexBuilder = {
    where: jest.fn().mockReturnThis(),
    whereNot: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(firstReturn),
    insert: jest.fn().mockResolvedValue([1]),
    update: jest.fn().mockResolvedValue(1),
  }
  return builder
}

/**
 * Constrói um mock do Knex para inviteAgencyMember.
 * O método é chamado 4 vezes em sequência (tabelas diferentes).
 * Cada chamada retorna um builder configurado para a etapa correspondente.
 *
 * Ordem de chamadas em inviteAgencyMember:
 *  1. knex('agency_members') — verificar membro existente (whereNot + first)
 *  2. knex('invites')        — verificar invite pendente existente (where + first)
 *  3. knex('agency_members') — buscar nome do convidador (where + first)
 *  4. knex('invites')        — inserir novo invite (insert)
 */
function buildInviteKnex({
  existingMember = undefined as unknown,
  existingInvite = undefined as unknown,
  inviter = INVITER as unknown,
} = {}) {
  const existingMemberBuilder = buildQueryBuilder(existingMember)
  const existingInviteBuilder = buildQueryBuilder(existingInvite)
  const inviterBuilder = buildQueryBuilder(inviter)
  const insertBuilder = buildQueryBuilder()

  const mockKnexFn = jest.fn()
    .mockReturnValueOnce(existingMemberBuilder)  // call 1: agency_members (check existing)
    .mockReturnValueOnce(existingInviteBuilder)  // call 2: invites (check pending invite)
    .mockReturnValueOnce(inviterBuilder)          // call 3: agency_members (fetch inviter)
    .mockReturnValueOnce(insertBuilder)           // call 4: invites (insert)

  return { mockKnexFn, existingMemberBuilder, existingInviteBuilder, inviterBuilder, insertBuilder }
}

/**
 * Constrói um mock do Knex para validateInviteToken e acceptInvite.
 * Estas funções fazem apenas 1 chamada knex() direta (fetch do invite).
 * O acceptInvite depois usa knex.transaction().
 *
 * A transação recebe um callback (trx) onde trx('table') retorna um builder
 * encadeável com insert e where/update. O mockTrx é construído como uma
 * função callable com a propriedade fn.now para compatibilidade com o Knex.
 */
function buildValidateKnex(inviteReturn: unknown) {
  const inviteBuilder = buildQueryBuilder(inviteReturn)
  const trxBuilder = buildQueryBuilder()

  // mockTrx precisa ser uma função callable (trx('table')) com fn.now
  const mockTrx = Object.assign(jest.fn().mockReturnValue(trxBuilder), {
    fn: { now: jest.fn().mockReturnValue('NOW()') },
  })

  const mockKnexFn = Object.assign(jest.fn().mockReturnValue(inviteBuilder), {
    transaction: jest.fn().mockImplementation(async (cb: (trx: typeof mockTrx) => Promise<void>) => cb(mockTrx)),
    fn: { now: jest.fn().mockReturnValue('NOW()') },
  })

  return { mockKnexFn, inviteBuilder, mockTrx, trxBuilder }
}

// ---------------------------------------------------------------------------
// Helper para criar o módulo de testes
// ---------------------------------------------------------------------------

/**
 * Cria o módulo de teste com EmailService injetado via provide de classe direta.
 * Importa EmailService dinamicamente para evitar carregar o módulo completo
 * (que inicializa o Resend client e carrega env) antes dos mocks estarem prontos.
 */
async function buildModule(knexFn: jest.Mock): Promise<InviteService> {
  const { EmailService } = await import('@/modules/email/email.service')

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      InviteService,
      { provide: KNEX, useValue: knexFn },
      { provide: EmailService, useValue: mockEmailService },
    ],
  }).compile()

  return module.get<InviteService>(InviteService)
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('InviteService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ==========================================================================
  // US-1.2 — inviteAgencyMember
  // ==========================================================================

  describe('inviteAgencyMember', () => {
    // ------------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------------

    describe('Happy path', () => {
      it('retorna { message: "Convite enviado com sucesso" } quando todos os dados são válidos', async () => {
        const { mockKnexFn } = buildInviteKnex({
          existingMember: undefined,
          existingInvite: undefined,
          inviter: INVITER,
        })

        const service = await buildModule(mockKnexFn)
        const result = await service.inviteAgencyMember('novo@nocrato.com', INVITER.id)

        expect(result).toEqual({ message: 'Convite enviado com sucesso' })
      })

      it('gera token com 64 caracteres hexadecimais (crypto.randomBytes(32).toString("hex"))', async () => {
        let capturedToken: string | undefined

        const { mockKnexFn, insertBuilder } = buildInviteKnex({
          existingMember: undefined,
          existingInvite: undefined,
          inviter: INVITER,
        })

        insertBuilder.insert.mockImplementation((data: Record<string, unknown>) => {
          capturedToken = data.token as string
          return Promise.resolve([1])
        })

        const service = await buildModule(mockKnexFn)
        await service.inviteAgencyMember('novo@nocrato.com', INVITER.id)

        expect(capturedToken).toBeDefined()
        expect(typeof capturedToken).toBe('string')
        expect(capturedToken).toHaveLength(64)
        expect(capturedToken).toMatch(/^[0-9a-f]{64}$/)
      })

      it('insere invite com type="agency_member", status="pending" e expires_at em ~7 dias', async () => {
        let capturedInsert: Record<string, unknown> | undefined

        const { mockKnexFn, insertBuilder } = buildInviteKnex({
          existingMember: undefined,
          existingInvite: undefined,
          inviter: INVITER,
        })

        insertBuilder.insert.mockImplementation((data: Record<string, unknown>) => {
          capturedInsert = data
          return Promise.resolve([1])
        })

        const before = Date.now()
        const service = await buildModule(mockKnexFn)
        await service.inviteAgencyMember('novo@nocrato.com', INVITER.id)
        const after = Date.now()

        expect(capturedInsert).toBeDefined()
        expect(capturedInsert!.type).toBe('agency_member')
        expect(capturedInsert!.status).toBe('pending')
        expect(capturedInsert!.email).toBe('novo@nocrato.com')
        expect(capturedInsert!.invited_by).toBe(INVITER.id)

        // expires_at deve ser 7 dias a partir de agora (tolerância de 5 segundos)
        const expiresAt = capturedInsert!.expires_at as Date
        const expectedMin = before + 7 * 24 * 60 * 60 * 1000 - 5000
        const expectedMax = after + 7 * 24 * 60 * 60 * 1000 + 5000
        expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin)
        expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax)
      })

      it('chama emailService.sendInviteMember com { to, token, invitedByName }', async () => {
        let capturedInsert: Record<string, unknown> | undefined

        const { mockKnexFn, insertBuilder } = buildInviteKnex({
          existingMember: undefined,
          existingInvite: undefined,
          inviter: INVITER,
        })

        insertBuilder.insert.mockImplementation((data: Record<string, unknown>) => {
          capturedInsert = data
          return Promise.resolve([1])
        })

        const service = await buildModule(mockKnexFn)
        await service.inviteAgencyMember('novo@nocrato.com', INVITER.id)

        expect(mockEmailService.sendInviteMember).toHaveBeenCalledTimes(1)
        expect(mockEmailService.sendInviteMember).toHaveBeenCalledWith({
          to: 'novo@nocrato.com',
          token: capturedInsert!.token,
          invitedByName: INVITER.name,
        })
      })

      it('usa fallback "Um administrador" como invitedByName quando inviter não é encontrado', async () => {
        // null é passado explicitamente — undefined ativa o default parameter (INVITER)
        const { mockKnexFn } = buildInviteKnex({
          existingMember: undefined,
          existingInvite: undefined,
          inviter: null, // null = inviter não encontrado no banco (first() retorna null/undefined)
        })

        const service = await buildModule(mockKnexFn)
        await service.inviteAgencyMember('novo@nocrato.com', 'id-inexistente')

        expect(mockEmailService.sendInviteMember).toHaveBeenCalledWith(
          expect.objectContaining({ invitedByName: 'Um administrador' }),
        )
      })

      it('consulta agency_members para verificar membro existente com whereNot({ status: "inactive" })', async () => {
        const { mockKnexFn, existingMemberBuilder } = buildInviteKnex({
          existingMember: undefined,
          existingInvite: undefined,
          inviter: INVITER,
        })

        const service = await buildModule(mockKnexFn)
        await service.inviteAgencyMember('novo@nocrato.com', INVITER.id)

        expect(mockKnexFn).toHaveBeenCalledWith('agency_members')
        expect(existingMemberBuilder.where).toHaveBeenCalledWith({ email: 'novo@nocrato.com' })
        expect(existingMemberBuilder.whereNot).toHaveBeenCalledWith({ status: 'inactive' })
        expect(existingMemberBuilder.first).toHaveBeenCalled()
      })

      it('consulta invites para verificar invite pendente com type="agency_member" e status="pending"', async () => {
        const { mockKnexFn, existingInviteBuilder } = buildInviteKnex({
          existingMember: undefined,
          existingInvite: undefined,
          inviter: INVITER,
        })

        const service = await buildModule(mockKnexFn)
        await service.inviteAgencyMember('novo@nocrato.com', INVITER.id)

        expect(mockKnexFn).toHaveBeenCalledWith('invites')
        expect(existingInviteBuilder.where).toHaveBeenCalledWith({
          email: 'novo@nocrato.com',
          type: 'agency_member',
          status: 'pending',
        })
        expect(existingInviteBuilder.first).toHaveBeenCalled()
      })
    })

    // ------------------------------------------------------------------------
    // Erro: membro ativo já existe
    // ------------------------------------------------------------------------

    describe('Erro: membro ativo já existe', () => {
      it('lança ConflictException("Este email já está cadastrado") quando já existe membro ativo', async () => {
        const { mockKnexFn } = buildInviteKnex({
          existingMember: ACTIVE_MEMBER,
          existingInvite: undefined,
          inviter: INVITER,
        })

        const service = await buildModule(mockKnexFn)

        await expect(
          service.inviteAgencyMember('admin@nocrato.com', INVITER.id),
        ).rejects.toThrow(new ConflictException('Este email já está cadastrado'))
      })

      it('não consulta a tabela invites quando membro ativo já existe', async () => {
        const { mockKnexFn } = buildInviteKnex({
          existingMember: ACTIVE_MEMBER,
          existingInvite: undefined,
          inviter: INVITER,
        })

        const service = await buildModule(mockKnexFn)

        await expect(
          service.inviteAgencyMember('admin@nocrato.com', INVITER.id),
        ).rejects.toThrow(ConflictException)

        // Apenas 1 chamada ao knex (check de membro) — não deve consultar invites
        expect(mockKnexFn).toHaveBeenCalledTimes(1)
      })

      it('não envia email quando membro ativo já existe', async () => {
        const { mockKnexFn } = buildInviteKnex({
          existingMember: ACTIVE_MEMBER,
          existingInvite: undefined,
          inviter: INVITER,
        })

        const service = await buildModule(mockKnexFn)

        await expect(
          service.inviteAgencyMember('admin@nocrato.com', INVITER.id),
        ).rejects.toThrow(ConflictException)

        expect(mockEmailService.sendInviteMember).not.toHaveBeenCalled()
      })
    })

    // ------------------------------------------------------------------------
    // Erro: invite pendente já existe
    // ------------------------------------------------------------------------

    describe('Erro: invite pendente já existe', () => {
      it('lança ConflictException("Já existe um convite pendente para este email") quando invite pendente existe', async () => {
        const { mockKnexFn } = buildInviteKnex({
          existingMember: undefined, // nenhum membro ativo
          existingInvite: PENDING_INVITE,
          inviter: INVITER,
        })

        const service = await buildModule(mockKnexFn)

        await expect(
          service.inviteAgencyMember('novo@nocrato.com', INVITER.id),
        ).rejects.toThrow(new ConflictException('Já existe um convite pendente para este email'))
      })

      it('não insere novo invite quando já existe invite pendente', async () => {
        const { mockKnexFn, insertBuilder } = buildInviteKnex({
          existingMember: undefined,
          existingInvite: PENDING_INVITE,
          inviter: INVITER,
        })

        const service = await buildModule(mockKnexFn)

        await expect(
          service.inviteAgencyMember('novo@nocrato.com', INVITER.id),
        ).rejects.toThrow(ConflictException)

        expect(insertBuilder.insert).not.toHaveBeenCalled()
      })

      it('não envia email quando já existe invite pendente', async () => {
        const { mockKnexFn } = buildInviteKnex({
          existingMember: undefined,
          existingInvite: PENDING_INVITE,
          inviter: INVITER,
        })

        const service = await buildModule(mockKnexFn)

        await expect(
          service.inviteAgencyMember('novo@nocrato.com', INVITER.id),
        ).rejects.toThrow(ConflictException)

        expect(mockEmailService.sendInviteMember).not.toHaveBeenCalled()
      })
    })
  })

  // ==========================================================================
  // US-1.3 — validateInviteToken
  // ==========================================================================

  describe('validateInviteToken', () => {
    // ------------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------------

    describe('Happy path', () => {
      it('retorna { email, valid: true } para token válido e pendente', async () => {
        const { mockKnexFn } = buildValidateKnex(PENDING_INVITE)

        const service = await buildModule(mockKnexFn)
        const result = await service.validateInviteToken(PENDING_INVITE.token)

        expect(result).toEqual({ email: PENDING_INVITE.email, valid: true })
      })

      it('consulta invites com { token, type: "agency_member" }', async () => {
        const { mockKnexFn, inviteBuilder } = buildValidateKnex(PENDING_INVITE)

        const service = await buildModule(mockKnexFn)
        await service.validateInviteToken(PENDING_INVITE.token)

        expect(mockKnexFn).toHaveBeenCalledWith('invites')
        expect(inviteBuilder.where).toHaveBeenCalledWith({
          token: PENDING_INVITE.token,
          type: 'agency_member',
        })
        expect(inviteBuilder.first).toHaveBeenCalled()
      })
    })

    // ------------------------------------------------------------------------
    // Erro: token não encontrado
    // ------------------------------------------------------------------------

    describe('Erro: token não encontrado', () => {
      it('lança NotFoundException("Convite não encontrado") quando token não existe', async () => {
        const { mockKnexFn } = buildValidateKnex(undefined)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.validateInviteToken('token-inexistente-' + 'a'.repeat(46)),
        ).rejects.toThrow(new NotFoundException('Convite não encontrado'))
      })

      it('lança NotFoundException quando invite existe mas type é diferente de "agency_member"', async () => {
        // A query já filtra por type='agency_member' — se o tipo for diferente, first() retorna undefined
        const { mockKnexFn } = buildValidateKnex(undefined)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.validateInviteToken(PENDING_INVITE.token),
        ).rejects.toThrow(NotFoundException)
      })
    })

    // ------------------------------------------------------------------------
    // Erro: convite já utilizado (status !== 'pending')
    // ------------------------------------------------------------------------

    describe('Erro: convite já utilizado', () => {
      it('lança BadRequestException("Este convite já foi utilizado") quando status é "accepted"', async () => {
        const { mockKnexFn } = buildValidateKnex(ACCEPTED_INVITE)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.validateInviteToken(ACCEPTED_INVITE.token),
        ).rejects.toThrow(new BadRequestException('Este convite já foi utilizado'))
      })

      it('lança BadRequestException para status "expired"', async () => {
        const expiredStatusInvite = { ...PENDING_INVITE, status: 'expired' as const }
        const { mockKnexFn } = buildValidateKnex(expiredStatusInvite)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.validateInviteToken(expiredStatusInvite.token),
        ).rejects.toThrow(new BadRequestException('Este convite já foi utilizado'))
      })
    })

    // ------------------------------------------------------------------------
    // Erro: convite expirado (expires_at < now)
    // ------------------------------------------------------------------------

    describe('Erro: convite expirado', () => {
      it('lança BadRequestException("Convite expirado") quando expires_at está no passado', async () => {
        const { mockKnexFn } = buildValidateKnex(EXPIRED_INVITE)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.validateInviteToken(EXPIRED_INVITE.token),
        ).rejects.toThrow(new BadRequestException('Convite expirado'))
      })

      it('verifica expiração APÓS verificar status — status inválido tem precedência', async () => {
        // Invite aceito E expirado: deve lançar "já foi utilizado" (status verificado primeiro)
        const acceptedAndExpired = {
          ...ACCEPTED_INVITE,
          expires_at: new Date(Date.now() - 1000),
        }
        const { mockKnexFn } = buildValidateKnex(acceptedAndExpired)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.validateInviteToken(acceptedAndExpired.token),
        ).rejects.toThrow(new BadRequestException('Este convite já foi utilizado'))
      })
    })
  })

  // ==========================================================================
  // US-1.3 — acceptInvite
  // ==========================================================================

  describe('acceptInvite', () => {
    const bcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>

    beforeEach(() => {
      bcryptHash.mockResolvedValue('$2b$10$mocked-hashed-password' as never)
    })

    // ------------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------------

    describe('Happy path', () => {
      it('retorna { message: "Conta criada com sucesso. Faça login para continuar." }', async () => {
        const { mockKnexFn } = buildValidateKnex(PENDING_INVITE)

        const service = await buildModule(mockKnexFn)
        const result = await service.acceptInvite(
          PENDING_INVITE.token,
          'Dr. Silva',
          'SenhaSegura@2025',
        )

        expect(result).toEqual({
          message: 'Conta criada com sucesso. Faça login para continuar.',
        })
      })

      it('usa knex.transaction() — insert em agency_members e update em invites são atômicos', async () => {
        const { mockKnexFn } = buildValidateKnex(PENDING_INVITE)

        const service = await buildModule(mockKnexFn)
        await service.acceptInvite(PENDING_INVITE.token, 'Dr. Silva', 'SenhaSegura@2025')

        expect(mockKnexFn.transaction).toHaveBeenCalledTimes(1)
      })

      it('hash da senha é gerado com bcrypt.hash(password, 10)', async () => {
        const { mockKnexFn } = buildValidateKnex(PENDING_INVITE)

        const service = await buildModule(mockKnexFn)
        await service.acceptInvite(PENDING_INVITE.token, 'Dr. Silva', 'SenhaSegura@2025')

        expect(bcryptHash).toHaveBeenCalledTimes(1)
        expect(bcryptHash).toHaveBeenCalledWith('SenhaSegura@2025', 10)
      })

      it('insere agency_member com role="agency_member", status="active" dentro da transação', async () => {
        const { mockKnexFn, trxBuilder } = buildValidateKnex(PENDING_INVITE)

        const insertCalls: Array<Record<string, unknown>> = []
        trxBuilder.insert.mockImplementation((data: Record<string, unknown>) => {
          insertCalls.push(data)
          return Promise.resolve([1])
        })

        const service = await buildModule(mockKnexFn)
        await service.acceptInvite(PENDING_INVITE.token, 'Dr. Silva', 'SenhaSegura@2025')

        // Deve haver ao menos 1 insert (agency_members)
        expect(trxBuilder.insert).toHaveBeenCalled()

        const memberInsert = insertCalls[0]
        expect(memberInsert.email).toBe(PENDING_INVITE.email)
        expect(memberInsert.name).toBe('Dr. Silva')
        expect(memberInsert.role).toBe('agency_member')
        expect(memberInsert.status).toBe('active')
        expect(memberInsert.password_hash).toBe('$2b$10$mocked-hashed-password')
      })

      it('nunca retorna password_hash no resultado do método', async () => {
        const { mockKnexFn } = buildValidateKnex(PENDING_INVITE)

        const service = await buildModule(mockKnexFn)
        const result = await service.acceptInvite(
          PENDING_INVITE.token,
          'Dr. Silva',
          'SenhaSegura@2025',
        )

        const resultJson = JSON.stringify(result)
        expect(resultJson).not.toContain('password_hash')
        expect(resultJson).not.toContain('$2b$')
        expect(result).not.toHaveProperty('password_hash')
      })

      it('atualiza status do invite para "accepted" dentro da transação', async () => {
        const { mockKnexFn, trxBuilder } = buildValidateKnex(PENDING_INVITE)

        const updateCalls: Array<Record<string, unknown>> = []
        trxBuilder.update.mockImplementation((data: Record<string, unknown>) => {
          updateCalls.push(data)
          return Promise.resolve(1)
        })

        const service = await buildModule(mockKnexFn)
        await service.acceptInvite(PENDING_INVITE.token, 'Dr. Silva', 'SenhaSegura@2025')

        expect(trxBuilder.update).toHaveBeenCalled()
        const inviteUpdate = updateCalls[0]
        expect(inviteUpdate.status).toBe('accepted')
        expect(inviteUpdate).toHaveProperty('accepted_at')
      })
    })

    // ------------------------------------------------------------------------
    // Erro: token não encontrado
    // ------------------------------------------------------------------------

    describe('Erro: token não encontrado', () => {
      it('lança NotFoundException("Convite não encontrado") quando token não existe', async () => {
        const { mockKnexFn } = buildValidateKnex(undefined)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.acceptInvite('token-invalido-' + 'b'.repeat(50), 'Dr. Silva', 'senha'),
        ).rejects.toThrow(new NotFoundException('Convite não encontrado'))
      })

      it('não usa transação quando token não existe', async () => {
        const { mockKnexFn } = buildValidateKnex(undefined)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.acceptInvite('token-invalido-' + 'b'.repeat(50), 'Dr. Silva', 'senha'),
        ).rejects.toThrow(NotFoundException)

        expect(mockKnexFn.transaction).not.toHaveBeenCalled()
      })

      it('não chama bcrypt.hash quando token não existe', async () => {
        const { mockKnexFn } = buildValidateKnex(undefined)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.acceptInvite('token-invalido-' + 'b'.repeat(50), 'Dr. Silva', 'senha'),
        ).rejects.toThrow(NotFoundException)

        expect(bcryptHash).not.toHaveBeenCalled()
      })
    })

    // ------------------------------------------------------------------------
    // Erro: convite já utilizado
    // ------------------------------------------------------------------------

    describe('Erro: convite já utilizado', () => {
      it('lança BadRequestException("Este convite já foi utilizado") quando status é "accepted"', async () => {
        const { mockKnexFn } = buildValidateKnex(ACCEPTED_INVITE)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.acceptInvite(ACCEPTED_INVITE.token, 'Dr. Silva', 'senha'),
        ).rejects.toThrow(new BadRequestException('Este convite já foi utilizado'))
      })

      it('não usa transação quando convite já foi utilizado', async () => {
        const { mockKnexFn } = buildValidateKnex(ACCEPTED_INVITE)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.acceptInvite(ACCEPTED_INVITE.token, 'Dr. Silva', 'senha'),
        ).rejects.toThrow(BadRequestException)

        expect(mockKnexFn.transaction).not.toHaveBeenCalled()
      })

      it('não chama bcrypt.hash quando convite já foi utilizado', async () => {
        const { mockKnexFn } = buildValidateKnex(ACCEPTED_INVITE)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.acceptInvite(ACCEPTED_INVITE.token, 'Dr. Silva', 'senha'),
        ).rejects.toThrow(BadRequestException)

        expect(bcryptHash).not.toHaveBeenCalled()
      })
    })

    // ------------------------------------------------------------------------
    // Erro: convite expirado
    // ------------------------------------------------------------------------

    describe('Erro: convite expirado', () => {
      it('lança BadRequestException("Convite expirado") quando expires_at está no passado', async () => {
        const { mockKnexFn } = buildValidateKnex(EXPIRED_INVITE)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.acceptInvite(EXPIRED_INVITE.token, 'Dr. Silva', 'senha'),
        ).rejects.toThrow(new BadRequestException('Convite expirado'))
      })

      it('não usa transação quando convite está expirado', async () => {
        const { mockKnexFn } = buildValidateKnex(EXPIRED_INVITE)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.acceptInvite(EXPIRED_INVITE.token, 'Dr. Silva', 'senha'),
        ).rejects.toThrow(BadRequestException)

        expect(mockKnexFn.transaction).not.toHaveBeenCalled()
      })

      it('não chama bcrypt.hash quando convite está expirado', async () => {
        const { mockKnexFn } = buildValidateKnex(EXPIRED_INVITE)

        const service = await buildModule(mockKnexFn)

        await expect(
          service.acceptInvite(EXPIRED_INVITE.token, 'Dr. Silva', 'senha'),
        ).rejects.toThrow(BadRequestException)

        expect(bcryptHash).not.toHaveBeenCalled()
      })
    })

    // ------------------------------------------------------------------------
    // Segurança
    // ------------------------------------------------------------------------

    describe('Segurança', () => {
      it('password_hash nunca aparece em nenhum momento no retorno de acceptInvite', async () => {
        const { mockKnexFn } = buildValidateKnex(PENDING_INVITE)

        const service = await buildModule(mockKnexFn)
        const result = await service.acceptInvite(
          PENDING_INVITE.token,
          'Dr. Silva',
          'SenhaSegura@2025',
        )

        expect(Object.keys(result)).toEqual(['message'])
        expect(result).not.toHaveProperty('password_hash')
        expect(result).not.toHaveProperty('email')
        expect(result).not.toHaveProperty('id')
      })

      it('bcrypt.hash é chamado com salt rounds = 10', async () => {
        const { mockKnexFn } = buildValidateKnex(PENDING_INVITE)

        const service = await buildModule(mockKnexFn)
        await service.acceptInvite(PENDING_INVITE.token, 'Dr. Silva', 'MinhaSenh@Forte99')

        expect(bcryptHash).toHaveBeenCalledWith('MinhaSenh@Forte99', 10)
      })
    })
  })
})
