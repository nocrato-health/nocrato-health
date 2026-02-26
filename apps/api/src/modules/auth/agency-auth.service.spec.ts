/**
 * US-1.1 — Login da Agência
 * US-1.7 — Forgot/Reset Password da Agência
 *
 * Testes unitários para AgencyAuthService
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando o query builder do Knex
 *  - JwtService: mock com jest.fn() para sign()
 *  - EmailService: mock com jest.fn() para sendPasswordReset()
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - bcrypt: mock de módulo para controlar compare() e hash()
 */

// Mockar env ANTES de qualquer import que o carregue transitivamente.
// env.ts chama process.exit(1) se vars estiverem ausentes — não pode rodar em testes.
jest.mock('@/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-16-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}))

jest.mock('bcrypt')

import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'

import { AgencyAuthService } from './agency-auth.service'
import { EmailService } from '@/modules/email/email.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface MockKnexBuilder {
  where: jest.Mock
  first: jest.Mock
  insert: jest.Mock
  update: jest.Mock
  forUpdate: jest.Mock
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTIVE_MEMBER = {
  id: 'member-uuid-001',
  email: 'admin@nocrato.com',
  password_hash: '$2b$10$hashedpassword',
  name: 'Admin Nocrato',
  role: 'agency_admin' as const,
  status: 'active' as const,
  last_login_at: null,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
}

const PENDING_MEMBER = { ...ACTIVE_MEMBER, status: 'pending' as const }
const INACTIVE_MEMBER = { ...ACTIVE_MEMBER, status: 'inactive' as const }
const MEMBER_WITHOUT_HASH = { ...ACTIVE_MEMBER, password_hash: null }

const RESET_TOKEN = 'agency-reset-token-hex64-valid'
const NEW_PASSWORD_HASH = '$2b$10$newhashedpassword'

const PENDING_RESET_INVITE = {
  id: 'reset-invite-uuid-001',
  type: 'password_reset' as const,
  email: ACTIVE_MEMBER.email,
  token: RESET_TOKEN,
  status: 'pending' as const,
  expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
}

// ---------------------------------------------------------------------------
// Factory de mock do Knex
// ---------------------------------------------------------------------------

function buildMockKnex(firstReturn: unknown) {
  const builder: MockKnexBuilder = {
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(firstReturn),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockResolvedValue(1),
    forUpdate: jest.fn().mockReturnThis(),
  }

  // O Knex é invocado como função: knex('agency_members').where(...).first()
  // Além disso, a query de update usa knex('agency_members').where(...).update(...)
  // O mesmo builder é reutilizado para ambas as chamadas porque onde importa é o
  // encadeamento — o mock de where retorna this e first/update são terminais.
  const mockKnexFn = jest.fn().mockReturnValue(builder) as jest.Mock & {
    fn: { now: jest.Mock }
  }
  mockKnexFn.fn = { now: jest.fn().mockReturnValue('NOW()') }

  return { mockKnexFn, builder }
}

// ---------------------------------------------------------------------------
// Factory de mock do builder Knex genérico (para novos testes)
// ---------------------------------------------------------------------------

function buildBuilder(firstReturn: unknown): MockKnexBuilder {
  return {
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(firstReturn),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockResolvedValue(1),
    forUpdate: jest.fn().mockReturnThis(),
  }
}

type KnexFnMock = jest.Mock & { fn: { now: jest.Mock } }

function buildKnexFn(...returnValues: unknown[]): KnexFnMock {
  let fn = jest.fn() as KnexFnMock
  fn.fn = { now: jest.fn().mockReturnValue('NOW()') }
  for (const val of returnValues) {
    fn = fn.mockReturnValueOnce(val) as KnexFnMock
  }
  return fn
}

// ---------------------------------------------------------------------------
// Factory de mock da transaction Knex para resetPassword (US-1.7)
// ---------------------------------------------------------------------------

function buildResetPasswordTransactionMock(memberRow: unknown) {
  const memberFindBuilder = buildBuilder(memberRow)
  const memberUpdateBuilder = buildBuilder(undefined)
  const inviteUpdateBuilder = buildBuilder(undefined)

  let trxCallCount = 0

  const trxFn = jest.fn().mockImplementation((_tableName: string) => {
    trxCallCount++
    if (trxCallCount === 1) return memberFindBuilder  // trx('agency_members').where().forUpdate().first()
    if (trxCallCount === 2) return memberUpdateBuilder // trx('agency_members').where().update()
    if (trxCallCount === 3) return inviteUpdateBuilder // trx('invites').where().update()
    return buildBuilder(undefined)
  }) as jest.Mock & { fn: { now: jest.Mock } }

  trxFn.fn = { now: jest.fn().mockReturnValue('NOW()') }

  return { trxFn, memberFindBuilder }
}

function buildForgotPasswordKnex() {
  const memberBuilder = buildBuilder(ACTIVE_MEMBER)
  const invalidateBuilder = buildBuilder(undefined)
  const insertBuilder = buildBuilder(undefined)
  insertBuilder.insert = jest.fn().mockReturnThis()

  const mockKnexFn = buildKnexFn(
    memberBuilder,    // knex('agency_members').where().first()
    invalidateBuilder, // knex('invites').where().update()
    insertBuilder,     // knex('invites').insert()
  )

  return { mockKnexFn, invalidateBuilder, insertBuilder }
}

function buildResetKnex(memberRow?: unknown) {
  const inviteBuilder = buildBuilder(PENDING_RESET_INVITE)
  const { trxFn, memberFindBuilder } = buildResetPasswordTransactionMock(
    memberRow ?? ACTIVE_MEMBER,
  )

  const mockKnexFn = buildKnexFn(inviteBuilder) as KnexFnMock & { transaction: jest.Mock }
  mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

  return { mockKnexFn, trxFn, memberFindBuilder }
}

// ---------------------------------------------------------------------------
// Helper para criar o módulo de testes
// ---------------------------------------------------------------------------

async function createModule(knexFn: jest.Mock): Promise<{
  service: AgencyAuthService
  jwtService: JwtService
  emailService: EmailService
}> {
  const mockJwtService = {
    sign: jest.fn().mockReturnValueOnce('access-token-stub').mockReturnValueOnce('refresh-token-stub'),
  }

  const mockEmailService = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  }

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AgencyAuthService,
      { provide: KNEX, useValue: knexFn },
      { provide: JwtService, useValue: mockJwtService },
      { provide: EmailService, useValue: mockEmailService },
    ],
  }).compile()

  return {
    service: module.get<AgencyAuthService>(AgencyAuthService),
    jwtService: module.get<JwtService>(JwtService),
    emailService: module.get<EmailService>(EmailService),
  }
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('AgencyAuthService — loginAgency', () => {
  const bcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('Happy path', () => {
    it('retorna accessToken, refreshToken e member ao autenticar com credenciais válidas', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      builder.first.mockResolvedValue(ACTIVE_MEMBER)
      // A segunda chamada ao knex() (update) deve retornar o builder também
      mockKnexFn
        .mockReturnValueOnce(builder) // knex('agency_members') — select
        .mockReturnValueOnce(builder) // knex('agency_members') — update

      bcryptCompare.mockResolvedValue(true as never)

      const { service } = await createModule(mockKnexFn)
      const result = await service.loginAgency('admin@nocrato.com', 'correct-password')

      expect(result).toEqual({
        accessToken: 'access-token-stub',
        refreshToken: 'refresh-token-stub',
        member: {
          id: ACTIVE_MEMBER.id,
          name: ACTIVE_MEMBER.name,
          email: ACTIVE_MEMBER.email,
          role: ACTIVE_MEMBER.role,
        },
      })
    })

    it('member retornado NÃO contém password_hash', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(builder)

      bcryptCompare.mockResolvedValue(true as never)

      const { service } = await createModule(mockKnexFn)
      const result = await service.loginAgency('admin@nocrato.com', 'correct-password')

      expect(result.member).not.toHaveProperty('password_hash')
    })

    it('member retornado contém exatamente os campos { id, name, email, role }', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(builder)

      bcryptCompare.mockResolvedValue(true as never)

      const { service } = await createModule(mockKnexFn)
      const { member } = await service.loginAgency('admin@nocrato.com', 'correct-password')

      const memberKeys = Object.keys(member).sort()
      expect(memberKeys).toEqual(['email', 'id', 'name', 'role'])
    })

    it('atualiza last_login_at APÓS emissão dos tokens', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      const callOrder: string[] = []

      // Captura a ordem das chamadas ao JwtService.sign e ao update do Knex
      mockKnexFn
        .mockReturnValueOnce(builder) // select
        .mockReturnValueOnce(builder) // update

      builder.update.mockImplementation(() => {
        callOrder.push('knex-update')
        return Promise.resolve(1)
      })

      bcryptCompare.mockResolvedValue(true as never)

      const mockJwtService = {
        sign: jest.fn().mockImplementation(() => {
          callOrder.push('jwt-sign')
          return 'some-token'
        }),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgencyAuthService,
          { provide: KNEX, useValue: mockKnexFn },
          { provide: JwtService, useValue: mockJwtService },
          { provide: EmailService, useValue: { sendPasswordReset: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile()

      const service = module.get<AgencyAuthService>(AgencyAuthService)
      await service.loginAgency('admin@nocrato.com', 'correct-password')

      // Os dois sign() devem ocorrer antes do update
      expect(callOrder).toEqual(['jwt-sign', 'jwt-sign', 'knex-update'])
    })

    it('consulta agency_members com where { email, status: "active" }', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(builder)

      bcryptCompare.mockResolvedValue(true as never)

      const { service } = await createModule(mockKnexFn)
      await service.loginAgency('admin@nocrato.com', 'correct-password')

      expect(mockKnexFn).toHaveBeenCalledWith('agency_members')
      expect(builder.where).toHaveBeenCalledWith({
        email: 'admin@nocrato.com',
        status: 'active',
      })
      expect(builder.first).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Casos de erro
  // -------------------------------------------------------------------------

  describe('Erro: email não encontrado', () => {
    it('lança UnauthorizedException com mensagem "Credenciais inválidas"', async () => {
      const { mockKnexFn, builder } = buildMockKnex(undefined)
      builder.first.mockResolvedValue(undefined)
      mockKnexFn.mockReturnValue(builder)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.loginAgency('inexistente@nocrato.com', 'qualquer-senha'),
      ).rejects.toThrow(new UnauthorizedException('Credenciais inválidas'))
    })

    it('não chama bcrypt.compare quando membro não é encontrado', async () => {
      const { mockKnexFn, builder } = buildMockKnex(undefined)
      mockKnexFn.mockReturnValue(builder)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.loginAgency('inexistente@nocrato.com', 'qualquer-senha'),
      ).rejects.toThrow(UnauthorizedException)

      expect(bcryptCompare).not.toHaveBeenCalled()
    })
  })

  describe('Erro: membro com status !== "active"', () => {
    it('lança UnauthorizedException para membro com status "pending"', async () => {
      // Membro pending: a query usa WHERE status='active', então first() retorna undefined
      // porque o banco filtra por status. O mock simula isso retornando undefined.
      const { mockKnexFn, builder } = buildMockKnex(undefined)
      mockKnexFn.mockReturnValue(builder)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.loginAgency(PENDING_MEMBER.email, 'senha-qualquer'),
      ).rejects.toThrow(new UnauthorizedException('Credenciais inválidas'))
    })

    it('lança UnauthorizedException para membro com status "inactive"', async () => {
      // Mesmo raciocínio: WHERE status='active' exclui inativos — first() retorna undefined
      const { mockKnexFn, builder } = buildMockKnex(undefined)
      mockKnexFn.mockReturnValue(builder)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.loginAgency(INACTIVE_MEMBER.email, 'senha-qualquer'),
      ).rejects.toThrow(new UnauthorizedException('Credenciais inválidas'))
    })
  })

  describe('Erro: senha incorreta', () => {
    it('lança UnauthorizedException quando bcrypt.compare retorna false', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn.mockReturnValue(builder)

      bcryptCompare.mockResolvedValue(false as never)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.loginAgency('admin@nocrato.com', 'senha-errada'),
      ).rejects.toThrow(new UnauthorizedException('Credenciais inválidas'))
    })

    it('não emite tokens quando a senha é incorreta', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn.mockReturnValue(builder)

      bcryptCompare.mockResolvedValue(false as never)

      const { service, jwtService } = await createModule(mockKnexFn)

      await expect(
        service.loginAgency('admin@nocrato.com', 'senha-errada'),
      ).rejects.toThrow(UnauthorizedException)

      expect(jwtService.sign).not.toHaveBeenCalled()
    })

    it('não atualiza last_login_at quando a senha é incorreta', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn.mockReturnValue(builder)

      bcryptCompare.mockResolvedValue(false as never)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.loginAgency('admin@nocrato.com', 'senha-errada'),
      ).rejects.toThrow(UnauthorizedException)

      expect(builder.update).not.toHaveBeenCalled()
    })
  })

  describe('Erro: membro sem password_hash (convite pendente)', () => {
    it('lança UnauthorizedException quando password_hash é null', async () => {
      const { mockKnexFn, builder } = buildMockKnex(MEMBER_WITHOUT_HASH)
      mockKnexFn.mockReturnValue(builder)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.loginAgency('admin@nocrato.com', 'qualquer-senha'),
      ).rejects.toThrow(new UnauthorizedException('Credenciais inválidas'))
    })

    it('não chama bcrypt.compare quando password_hash é null', async () => {
      const { mockKnexFn, builder } = buildMockKnex(MEMBER_WITHOUT_HASH)
      mockKnexFn.mockReturnValue(builder)

      const { service } = await createModule(mockKnexFn)

      await expect(
        service.loginAgency('admin@nocrato.com', 'qualquer-senha'),
      ).rejects.toThrow(UnauthorizedException)

      expect(bcryptCompare).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Segurança
  // -------------------------------------------------------------------------

  describe('US-1.7 — forgotPassword', () => {
    const SAFE_MESSAGE = 'Se este e-mail estiver cadastrado, você receberá as instruções em breve.'

    describe('Happy path: email encontrado', () => {
      it('retorna a mensagem segura quando o email existe', async () => {
        const { mockKnexFn } = buildForgotPasswordKnex()

        const { service } = await createModule(mockKnexFn)
        const result = await service.forgotPassword(ACTIVE_MEMBER.email)

        expect(result).toEqual({ message: SAFE_MESSAGE })
      })

      it('invalida tokens pendentes anteriores antes de inserir um novo', async () => {
        const { mockKnexFn, invalidateBuilder } = buildForgotPasswordKnex()

        const { service } = await createModule(mockKnexFn)
        await service.forgotPassword(ACTIVE_MEMBER.email)

        expect(invalidateBuilder.where).toHaveBeenCalledWith({
          email: ACTIVE_MEMBER.email,
          type: 'password_reset',
          status: 'pending',
        })
        expect(invalidateBuilder.update).toHaveBeenCalledWith({ status: 'expired' })
      })

      it('insere um novo invite do tipo password_reset', async () => {
        const { mockKnexFn, insertBuilder } = buildForgotPasswordKnex()

        const { service } = await createModule(mockKnexFn)
        await service.forgotPassword(ACTIVE_MEMBER.email)

        expect(insertBuilder.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'password_reset',
            email: ACTIVE_MEMBER.email,
            status: 'pending',
            token: expect.any(String),
            expires_at: expect.any(Date),
          }),
        )
      })

      it('chama EmailService.sendPasswordReset com { to, token, userType: "agency" }', async () => {
        const { mockKnexFn } = buildForgotPasswordKnex()

        const { service, emailService } = await createModule(mockKnexFn)
        await service.forgotPassword(ACTIVE_MEMBER.email)

        expect(emailService.sendPasswordReset).toHaveBeenCalledWith({
          to: ACTIVE_MEMBER.email,
          token: expect.any(String),
          userType: 'agency',
        })
      })

      it('ainda retorna a mensagem segura mesmo que EmailService lance erro', async () => {
        const insertBuilder = buildBuilder(undefined)
        insertBuilder.insert = jest.fn().mockReturnThis()

        const mockKnexFn = buildKnexFn(
          buildBuilder(ACTIVE_MEMBER),
          buildBuilder(undefined),
          insertBuilder,
        )

        const mockJwtService = {
          sign: jest.fn()
            .mockReturnValueOnce('access-token-stub')
            .mockReturnValueOnce('refresh-token-stub'),
        }

        const mockEmailService = {
          sendPasswordReset: jest.fn().mockRejectedValue(new Error('SMTP failure')),
        }

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            AgencyAuthService,
            { provide: KNEX, useValue: mockKnexFn },
            { provide: JwtService, useValue: mockJwtService },
            { provide: EmailService, useValue: mockEmailService },
          ],
        }).compile()

        const service = module.get<AgencyAuthService>(AgencyAuthService)
        const result = await service.forgotPassword(ACTIVE_MEMBER.email)

        expect(result).toEqual({ message: SAFE_MESSAGE })
      })
    })

    describe('Happy path: email não encontrado', () => {
      it('retorna a mesma mensagem segura sem criar token nem enviar email', async () => {
        const mockKnexFn = buildKnexFn(buildBuilder(undefined))

        const { service, emailService } = await createModule(mockKnexFn)
        const result = await service.forgotPassword('notfound@nocrato.com')

        expect(result).toEqual({ message: SAFE_MESSAGE })
        expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
      })

      it('não revela se o email existe — mesma mensagem para found e not-found', async () => {
        const mockKnexFnNotFound = buildKnexFn(buildBuilder(undefined))

        const insertBuilder = buildBuilder(undefined)
        insertBuilder.insert = jest.fn().mockReturnThis()
        const mockKnexFnFound = buildKnexFn(
          buildBuilder(ACTIVE_MEMBER),
          buildBuilder(undefined),
          insertBuilder,
        )

        const { service: serviceNotFound } = await createModule(mockKnexFnNotFound)
        const { service: serviceFound } = await createModule(mockKnexFnFound)

        const resultNotFound = await serviceNotFound.forgotPassword('notfound@nocrato.com')
        const resultFound = await serviceFound.forgotPassword(ACTIVE_MEMBER.email)

        expect(resultNotFound.message).toBe(resultFound.message)
      })
    })

  })

  describe('US-1.7 — resetPassword', () => {
    const bcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>

    describe('Happy path', () => {
      it('retorna { message: "Senha redefinida com sucesso" } com token válido', async () => {
        bcryptHash.mockResolvedValue(NEW_PASSWORD_HASH as never)
        const { mockKnexFn } = buildResetKnex()

        const { service } = await createModule(mockKnexFn)
        const result = await service.resetPassword(RESET_TOKEN, 'NewPass123!')

        expect(result).toEqual({ message: 'Senha redefinida com sucesso' })
      })

      it('chama bcrypt.hash com (newPassword, 10) ANTES de iniciar a transaction', async () => {
        const callOrder: string[] = []

        bcryptHash.mockImplementation(async () => {
          callOrder.push('bcrypt-hash')
          return NEW_PASSWORD_HASH as never
        })

        const mockKnexFn = buildKnexFn(buildBuilder(PENDING_RESET_INVITE)) as KnexFnMock & { transaction: jest.Mock }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => {
          callOrder.push('transaction-start')
          const { trxFn } = buildResetPasswordTransactionMock(ACTIVE_MEMBER)
          return cb(trxFn)
        })

        const { service } = await createModule(mockKnexFn)
        await service.resetPassword(RESET_TOKEN, 'NewPass123!')

        expect(bcryptHash).toHaveBeenCalledWith('NewPass123!', 10)
        expect(callOrder[0]).toBe('bcrypt-hash')
        expect(callOrder[1]).toBe('transaction-start')
      })

      it('usa forUpdate() ao buscar o membro dentro da transaction', async () => {
        bcryptHash.mockResolvedValue(NEW_PASSWORD_HASH as never)
        const { mockKnexFn, memberFindBuilder } = buildResetKnex()

        const { service } = await createModule(mockKnexFn)
        await service.resetPassword(RESET_TOKEN, 'NewPass123!')

        expect(memberFindBuilder.forUpdate).toHaveBeenCalled()
      })

      it('atualiza password_hash do membro e marca invite como accepted na mesma transaction', async () => {
        bcryptHash.mockResolvedValue(NEW_PASSWORD_HASH as never)
        const { mockKnexFn, trxFn } = buildResetKnex()

        const { service } = await createModule(mockKnexFn)
        await service.resetPassword(RESET_TOKEN, 'NewPass123!')

        expect(trxFn).toHaveBeenCalledTimes(3)
        expect(trxFn).toHaveBeenNthCalledWith(1, 'agency_members')
        expect(trxFn).toHaveBeenNthCalledWith(2, 'agency_members')
        expect(trxFn).toHaveBeenNthCalledWith(3, 'invites')
      })
    })

    describe('Erro: token inválido ou expirado', () => {
      it('lança BadRequestException("Token inválido ou expirado") quando invite não encontrado', async () => {
        const mockKnexFn = buildKnexFn(buildBuilder(undefined)) as KnexFnMock & { transaction: jest.Mock }
        mockKnexFn.transaction = jest.fn()

        const { service } = await createModule(mockKnexFn)

        await expect(service.resetPassword('invalid-token', 'NewPass123!')).rejects.toThrow(
          new BadRequestException('Token inválido ou expirado'),
        )
      })

      it('não inicia transaction quando token é inválido', async () => {
        const mockKnexFn = buildKnexFn(buildBuilder(undefined)) as KnexFnMock & { transaction: jest.Mock }
        mockKnexFn.transaction = jest.fn()

        const { service } = await createModule(mockKnexFn)

        await expect(service.resetPassword('invalid-token', 'NewPass123!')).rejects.toThrow(
          BadRequestException,
        )

        expect(mockKnexFn.transaction).not.toHaveBeenCalled()
      })
    })

    describe('Erro: conta não encontrada dentro da transaction', () => {
      it('lança NotFoundException("Conta não encontrada") quando membro não existe na trx', async () => {
        bcryptHash.mockResolvedValue(NEW_PASSWORD_HASH as never)

        const { trxFn } = buildResetPasswordTransactionMock(undefined)

        const mockKnexFn = buildKnexFn(buildBuilder(PENDING_RESET_INVITE)) as KnexFnMock & { transaction: jest.Mock }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

        const { service } = await createModule(mockKnexFn)

        await expect(service.resetPassword(RESET_TOKEN, 'NewPass123!')).rejects.toThrow(
          new NotFoundException('Conta não encontrada'),
        )
      })
    })
  })

  describe('Segurança', () => {
    it('bcrypt.compare é chamado com (senhaFornecida, passwordHash) na ordem correta', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(builder)

      bcryptCompare.mockResolvedValue(true as never)

      const { service } = await createModule(mockKnexFn)
      await service.loginAgency('admin@nocrato.com', 'minha-senha-secreta')

      expect(bcryptCompare).toHaveBeenCalledTimes(1)
      expect(bcryptCompare).toHaveBeenCalledWith(
        'minha-senha-secreta',
        ACTIVE_MEMBER.password_hash,
      )
    })

    it('access token e refresh token são assinados com segredos diferentes', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(builder)

      bcryptCompare.mockResolvedValue(true as never)

      const signCalls: Array<{ secret: string; expiresIn: string }> = []

      const mockJwtService = {
        sign: jest.fn().mockImplementation((_payload, options) => {
          signCalls.push(options)
          return 'some-token'
        }),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgencyAuthService,
          { provide: KNEX, useValue: mockKnexFn },
          { provide: JwtService, useValue: mockJwtService },
          { provide: EmailService, useValue: { sendPasswordReset: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile()

      const service = module.get<AgencyAuthService>(AgencyAuthService)
      await service.loginAgency('admin@nocrato.com', 'minha-senha-secreta')

      expect(signCalls).toHaveLength(2)

      const [accessOptions, refreshOptions] = signCalls
      expect(accessOptions.secret).toBeDefined()
      expect(refreshOptions.secret).toBeDefined()
      // Os segredos devem ser diferentes
      expect(accessOptions.secret).not.toBe(refreshOptions.secret)
    })

    it('access token usa JWT_SECRET e refresh token usa JWT_REFRESH_SECRET', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(builder)

      bcryptCompare.mockResolvedValue(true as never)

      const signCalls: Array<{ secret: string; expiresIn: string }> = []

      const mockJwtService = {
        sign: jest.fn().mockImplementation((_payload, options) => {
          signCalls.push(options)
          return 'some-token'
        }),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgencyAuthService,
          { provide: KNEX, useValue: mockKnexFn },
          { provide: JwtService, useValue: mockJwtService },
          { provide: EmailService, useValue: { sendPasswordReset: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile()

      const service = module.get<AgencyAuthService>(AgencyAuthService)
      await service.loginAgency('admin@nocrato.com', 'minha-senha-secreta')

      const [accessOptions, refreshOptions] = signCalls
      expect(accessOptions.secret).toBe('test-secret-at-least-16-chars')
      expect(refreshOptions.secret).toBe('test-refresh-secret-at-least-16')
    })

    it('payload JWT contém { sub, type: "agency", role } sem dados sensíveis', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(builder)

      bcryptCompare.mockResolvedValue(true as never)

      const signPayloads: Array<Record<string, unknown>> = []

      const mockJwtService = {
        sign: jest.fn().mockImplementation((payload) => {
          signPayloads.push({ ...payload })
          return 'some-token'
        }),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgencyAuthService,
          { provide: KNEX, useValue: mockKnexFn },
          { provide: JwtService, useValue: mockJwtService },
          { provide: EmailService, useValue: { sendPasswordReset: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile()

      const service = module.get<AgencyAuthService>(AgencyAuthService)
      await service.loginAgency('admin@nocrato.com', 'minha-senha-secreta')

      // Ambos os tokens devem usar o mesmo payload base
      for (const payload of signPayloads) {
        expect(payload.sub).toBe(ACTIVE_MEMBER.id)
        expect(payload.type).toBe('agency')
        expect(payload.role).toBe(ACTIVE_MEMBER.role)
        // Dados sensíveis jamais devem estar no payload
        expect(payload).not.toHaveProperty('password_hash')
        expect(payload).not.toHaveProperty('email')
        expect(payload).not.toHaveProperty('name')
      }
    })

    it('password_hash nunca aparece no retorno do método loginAgency', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(builder)

      bcryptCompare.mockResolvedValue(true as never)

      const { service } = await createModule(mockKnexFn)
      const result = await service.loginAgency('admin@nocrato.com', 'minha-senha-secreta')

      const resultJson = JSON.stringify(result)
      expect(resultJson).not.toContain('password_hash')
      expect(resultJson).not.toContain('$2b$')
    })

    it('access token tem expiresIn de 15m e refresh token tem expiresIn de 7d', async () => {
      const { mockKnexFn, builder } = buildMockKnex(ACTIVE_MEMBER)
      mockKnexFn
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(builder)

      bcryptCompare.mockResolvedValue(true as never)

      const signCalls: Array<{ secret: string; expiresIn: string }> = []

      const mockJwtService = {
        sign: jest.fn().mockImplementation((_payload, options) => {
          signCalls.push(options)
          return 'some-token'
        }),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgencyAuthService,
          { provide: KNEX, useValue: mockKnexFn },
          { provide: JwtService, useValue: mockJwtService },
          { provide: EmailService, useValue: { sendPasswordReset: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile()

      const service = module.get<AgencyAuthService>(AgencyAuthService)
      await service.loginAgency('admin@nocrato.com', 'minha-senha-secreta')

      const [accessOptions, refreshOptions] = signCalls
      expect(accessOptions.expiresIn).toBe('15m')
      expect(refreshOptions.expiresIn).toBe('7d')
    })
  })
})

// =============================================================================
// US-1.8 — AgencyAuthService.refreshToken
// =============================================================================

describe('AgencyAuthService — US-1.8 — refreshToken', () => {
  const AGENCY_REFRESH_PAYLOAD = {
    sub: ACTIVE_MEMBER.id,
    type: 'agency',
    role: 'agency_admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  }

  async function createRefreshModule(verifyImpl: () => unknown) {
    const mockJwtService = {
      verify: jest.fn().mockImplementation(verifyImpl),
      sign: jest.fn()
        .mockReturnValueOnce('new-access-token-stub')
        .mockReturnValueOnce('new-refresh-token-stub'),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgencyAuthService,
        { provide: KNEX, useValue: jest.fn() },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: { sendPasswordReset: jest.fn() } },
      ],
    }).compile()

    return {
      service: module.get<AgencyAuthService>(AgencyAuthService),
      jwtService: module.get<JwtService>(JwtService),
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Happy path', () => {
    it('retorna { accessToken, refreshToken } com token válido', async () => {
      const { service } = await createRefreshModule(() => AGENCY_REFRESH_PAYLOAD)

      const result = await service.refreshToken('valid-refresh-token')

      expect(result).toEqual({
        accessToken: 'new-access-token-stub',
        refreshToken: 'new-refresh-token-stub',
      })
    })

    it('re-emite com JWT_SECRET para access e JWT_REFRESH_SECRET para refresh', async () => {
      const signCalls: Array<{ secret: string; expiresIn: string }> = []

      const mockJwtService = {
        verify: jest.fn().mockReturnValue(AGENCY_REFRESH_PAYLOAD),
        sign: jest.fn().mockImplementation((_payload, options) => {
          signCalls.push(options)
          return 'some-token'
        }),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgencyAuthService,
          { provide: KNEX, useValue: jest.fn() },
          { provide: JwtService, useValue: mockJwtService },
          { provide: EmailService, useValue: { sendPasswordReset: jest.fn() } },
        ],
      }).compile()

      const service = module.get<AgencyAuthService>(AgencyAuthService)
      await service.refreshToken('valid-refresh-token')

      expect(signCalls[0].secret).toBe('test-secret-at-least-16-chars')
      expect(signCalls[0].expiresIn).toBe('15m')
      expect(signCalls[1].secret).toBe('test-refresh-secret-at-least-16')
      expect(signCalls[1].expiresIn).toBe('7d')
    })

    it('payload do re-emit contém { sub, type: "agency", role } sem tenantId', async () => {
      const signPayloads: Array<Record<string, unknown>> = []

      const mockJwtService = {
        verify: jest.fn().mockReturnValue(AGENCY_REFRESH_PAYLOAD),
        sign: jest.fn().mockImplementation((payload) => {
          signPayloads.push({ ...payload })
          return 'some-token'
        }),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgencyAuthService,
          { provide: KNEX, useValue: jest.fn() },
          { provide: JwtService, useValue: mockJwtService },
          { provide: EmailService, useValue: { sendPasswordReset: jest.fn() } },
        ],
      }).compile()

      const service = module.get<AgencyAuthService>(AgencyAuthService)
      await service.refreshToken('valid-refresh-token')

      for (const payload of signPayloads) {
        expect(payload.sub).toBe(AGENCY_REFRESH_PAYLOAD.sub)
        expect(payload.type).toBe('agency')
        expect(payload.role).toBe(AGENCY_REFRESH_PAYLOAD.role)
        expect(payload).not.toHaveProperty('tenantId')
      }
    })
  })

  describe('Erro: token inválido ou expirado', () => {
    it('lança UnauthorizedException quando jwtService.verify lança erro', async () => {
      const { service } = await createRefreshModule(() => {
        throw new Error('jwt expired')
      })

      await expect(service.refreshToken('expired-token')).rejects.toThrow(
        new UnauthorizedException('Refresh token inválido ou expirado'),
      )
    })
  })

  describe('Segurança: cross-domain', () => {
    it('lança UnauthorizedException quando type é "doctor" (token de doutor no endpoint de agency)', async () => {
      const doctorPayload = { ...AGENCY_REFRESH_PAYLOAD, type: 'doctor' }
      const { service } = await createRefreshModule(() => doctorPayload)

      await expect(service.refreshToken('doctor-refresh-token')).rejects.toThrow(
        new UnauthorizedException('Refresh token inválido ou expirado'),
      )
    })
  })
})
