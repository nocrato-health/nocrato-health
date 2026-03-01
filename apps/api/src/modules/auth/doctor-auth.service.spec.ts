/**
 * US-1.5 — Aceitar Convite de Doutor
 * US-1.6 — Resolver Email e Login do Doutor
 * US-1.7 — Forgot/Reset Password do Doutor
 *
 * Testes unitários para DoctorAuthService
 *
 * Estratégia de mock:
 *  - KNEX: mock via Symbol token, simulando query builder + transaction do Knex
 *  - JwtService: mock com jest.fn() para sign()
 *  - EmailService: mock com jest.fn() para sendPasswordReset()
 *  - @/config/env: mock de módulo para evitar process.exit(1) na ausência de .env
 *  - bcrypt: mock de módulo para controlar hash() e compare()
 */

// Mockar env ANTES de qualquer import que o carregue transitivamente.
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
import { NotFoundException, BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'

import { DoctorAuthService } from './doctor-auth.service'
import { EmailService } from '@/modules/email/email.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'valid-invite-token-hex64'
const DOCTOR_EMAIL = 'dr.joao@example.com'
const DOCTOR_NAME = 'Dr. João Silva'
const DOCTOR_PASSWORD = 'SecurePass123!'
const DOCTOR_SLUG = 'dr-joao-silva'
const PASSWORD_HASH = '$2b$10$hashedpassword'
const RESET_TOKEN = 'reset-token-hex64-valid'

const PENDING_INVITE = {
  id: 'invite-uuid-001',
  type: 'doctor' as const,
  email: DOCTOR_EMAIL,
  token: VALID_TOKEN,
  status: 'pending' as const,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // futuro
}

const ACCEPTED_INVITE = {
  ...PENDING_INVITE,
  status: 'accepted' as const,
}

const EXPIRED_INVITE = {
  ...PENDING_INVITE,
  expires_at: new Date(Date.now() - 1000), // passado
}

const CREATED_TENANT = {
  id: 'tenant-uuid-001',
  slug: DOCTOR_SLUG,
  name: DOCTOR_NAME,
}

const CREATED_DOCTOR = {
  id: 'doctor-uuid-001',
  tenant_id: CREATED_TENANT.id,
  email: DOCTOR_EMAIL,
  name: DOCTOR_NAME,
  password_hash: PASSWORD_HASH,
  status: 'active' as const,
}

const ACTIVE_DOCTOR = {
  id: 'doctor-uuid-001',
  tenant_id: CREATED_TENANT.id,
  email: DOCTOR_EMAIL,
  name: DOCTOR_NAME,
  password_hash: PASSWORD_HASH,
  status: 'active' as const,
}

const PENDING_RESET_INVITE = {
  id: 'reset-invite-uuid-001',
  type: 'password_reset' as const,
  email: DOCTOR_EMAIL,
  token: RESET_TOKEN,
  status: 'pending' as const,
  expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
}

// ---------------------------------------------------------------------------
// Factory de mock do builder Knex
// ---------------------------------------------------------------------------

interface MockKnexBuilder {
  where: jest.Mock
  first: jest.Mock
  insert: jest.Mock
  returning: jest.Mock
  update: jest.Mock
  forUpdate: jest.Mock
}

function buildBuilder(firstReturn: unknown, returningReturn?: unknown[]): MockKnexBuilder {
  const builder: MockKnexBuilder = {
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(firstReturn),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(returningReturn ?? []),
    update: jest.fn().mockResolvedValue(1),
    forUpdate: jest.fn().mockReturnThis(),
  }
  return builder
}

type KnexFnMock = jest.Mock & { fn: { now: jest.Mock } }

// Creates a typed Knex mock that accepts .fn.now() assignments without TS errors.
function buildKnexFn(...returnValues: unknown[]): KnexFnMock {
  let fn = jest.fn() as KnexFnMock
  fn.fn = { now: jest.fn().mockReturnValue('NOW()') }
  for (const val of returnValues) {
    fn = fn.mockReturnValueOnce(val) as KnexFnMock
  }
  return fn
}

// ---------------------------------------------------------------------------
// Factory de mock da transaction Knex para acceptDoctorInvite (US-1.5)
// ---------------------------------------------------------------------------

function buildTransactionMock(options: {
  existingTenant?: unknown
  existingDoctor?: unknown
  tenantRow?: unknown
  doctorRow?: unknown
}) {
  const { existingTenant = undefined, existingDoctor = undefined, tenantRow = CREATED_TENANT, doctorRow = CREATED_DOCTOR } = options

  const tenantCheckBuilder = buildBuilder(existingTenant)
  const doctorCheckBuilder = buildBuilder(existingDoctor)
  const tenantInsertBuilder = buildBuilder(undefined, [tenantRow])
  const doctorInsertBuilder = buildBuilder(undefined, [doctorRow])
  const agentSettingsBuilder = buildBuilder(undefined, [1])
  const inviteUpdateBuilder = buildBuilder(undefined)

  let trxCallCount = 0

  const trxFn = jest.fn().mockImplementation((_tableName: string) => {
    trxCallCount++
    if (trxCallCount === 1) return tenantCheckBuilder
    if (trxCallCount === 2) return doctorCheckBuilder
    if (trxCallCount === 3) return tenantInsertBuilder
    if (trxCallCount === 4) return doctorInsertBuilder
    if (trxCallCount === 5) return agentSettingsBuilder
    if (trxCallCount === 6) return inviteUpdateBuilder
    return buildBuilder(undefined)
  }) as jest.Mock & { fn: { now: jest.Mock } }

  trxFn.fn = { now: jest.fn().mockReturnValue('NOW()') }

  return trxFn
}

// ---------------------------------------------------------------------------
// Factory de mock da transaction Knex para resetPassword (US-1.7)
// ---------------------------------------------------------------------------

function buildResetPasswordTransactionMock(options: {
  doctorRow?: unknown
}) {
  const { doctorRow = ACTIVE_DOCTOR } = options

  const doctorFindBuilder = buildBuilder(doctorRow)
  const doctorUpdateBuilder = buildBuilder(undefined)
  const inviteUpdateBuilder = buildBuilder(undefined)

  let trxCallCount = 0

  const trxFn = jest.fn().mockImplementation((_tableName: string) => {
    trxCallCount++
    if (trxCallCount === 1) return doctorFindBuilder  // trx('doctors').where().forUpdate().first()
    if (trxCallCount === 2) return doctorUpdateBuilder // trx('doctors').where().update()
    if (trxCallCount === 3) return inviteUpdateBuilder // trx('invites').where().update()
    return buildBuilder(undefined)
  }) as jest.Mock & { fn: { now: jest.Mock } }

  trxFn.fn = { now: jest.fn().mockReturnValue('NOW()') }

  return trxFn
}

// ---------------------------------------------------------------------------
// Helper para criar o módulo de testes
// ---------------------------------------------------------------------------

async function createModule(knexFn: jest.Mock): Promise<{
  service: DoctorAuthService
  jwtService: JwtService
  emailService: EmailService
}> {
  const mockJwtService = {
    sign: jest.fn()
      .mockReturnValueOnce('access-token-stub')
      .mockReturnValueOnce('refresh-token-stub'),
  }

  const mockEmailService = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  }

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DoctorAuthService,
      { provide: KNEX, useValue: knexFn },
      { provide: JwtService, useValue: mockJwtService },
      { provide: EmailService, useValue: mockEmailService },
    ],
  }).compile()

  return {
    service: module.get<DoctorAuthService>(DoctorAuthService),
    jwtService: module.get<JwtService>(JwtService),
    emailService: module.get<EmailService>(EmailService),
  }
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('DoctorAuthService', () => {
  const bcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>
  const bcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // =========================================================================
  // US-1.5 — validateDoctorInviteToken
  // =========================================================================

  describe('US-1.5 — validateDoctorInviteToken', () => {
    describe('Happy path', () => {
      it('should return { email, valid: true } for a valid pending token', async () => {
        const inviteBuilder = buildBuilder(PENDING_INVITE)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder)

        const { service } = await createModule(mockKnexFn)
        const result = await service.validateDoctorInviteToken(VALID_TOKEN)

        expect(result).toEqual({ email: PENDING_INVITE.email, valid: true })
      })

      it('should query invites table with { token, type: "doctor" }', async () => {
        const inviteBuilder = buildBuilder(PENDING_INVITE)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder)

        const { service } = await createModule(mockKnexFn)
        await service.validateDoctorInviteToken(VALID_TOKEN)

        expect(mockKnexFn).toHaveBeenCalledWith('invites')
        expect(inviteBuilder.where).toHaveBeenCalledWith({ token: VALID_TOKEN, type: 'doctor' })
        expect(inviteBuilder.first).toHaveBeenCalled()
      })
    })

    describe('Erro: token não encontrado', () => {
      it('should throw NotFoundException when token does not exist', async () => {
        const inviteBuilder = buildBuilder(undefined)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder)

        const { service } = await createModule(mockKnexFn)

        await expect(service.validateDoctorInviteToken('nonexistent-token')).rejects.toThrow(
          new NotFoundException('Convite não encontrado'),
        )
      })
    })

    describe('Erro: token já utilizado', () => {
      it('should throw BadRequestException when invite status is "accepted"', async () => {
        const inviteBuilder = buildBuilder(ACCEPTED_INVITE)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder)

        const { service } = await createModule(mockKnexFn)

        await expect(service.validateDoctorInviteToken(VALID_TOKEN)).rejects.toThrow(
          new BadRequestException('Este convite já foi utilizado'),
        )
      })

      it('should throw BadRequestException when invite status is "expired"', async () => {
        const expiredStatusInvite = { ...PENDING_INVITE, status: 'expired' as const }
        const inviteBuilder = buildBuilder(expiredStatusInvite)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder)

        const { service } = await createModule(mockKnexFn)

        await expect(service.validateDoctorInviteToken(VALID_TOKEN)).rejects.toThrow(
          BadRequestException,
        )
      })
    })

    describe('Erro: token expirado', () => {
      it('should throw BadRequestException when expires_at is in the past', async () => {
        const inviteBuilder = buildBuilder(EXPIRED_INVITE)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder)

        const { service } = await createModule(mockKnexFn)

        await expect(service.validateDoctorInviteToken(VALID_TOKEN)).rejects.toThrow(
          new BadRequestException('Convite expirado'),
        )
      })
    })
  })

  // =========================================================================
  // US-1.5 — acceptDoctorInvite
  // =========================================================================

  describe('US-1.5 — acceptDoctorInvite', () => {
    describe('Happy path', () => {
      function buildSuccessKnex() {
        const inviteBuilder = buildBuilder(PENDING_INVITE)
        const trxFn = buildTransactionMock({})

        const mockKnexFn = jest.fn().mockReturnValueOnce(inviteBuilder) as jest.Mock & {
          transaction: jest.Mock
        }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

        return { mockKnexFn, trxFn }
      }

      it('should return { accessToken, refreshToken, doctor, tenant } on success', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)
        const { mockKnexFn } = buildSuccessKnex()

        const { service } = await createModule(mockKnexFn)
        const result = await service.acceptDoctorInvite(
          VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG,
        )

        expect(result).toEqual({
          accessToken: 'access-token-stub',
          refreshToken: 'refresh-token-stub',
          doctor: {
            id: CREATED_DOCTOR.id,
            name: DOCTOR_NAME,
            email: PENDING_INVITE.email,
          },
          tenant: {
            id: CREATED_TENANT.id,
            slug: DOCTOR_SLUG,
            name: DOCTOR_NAME,
          },
        })
      })

      it('should call bcrypt.hash with password and 10 rounds', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)
        const { mockKnexFn } = buildSuccessKnex()

        const { service } = await createModule(mockKnexFn)
        await service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG)

        expect(bcryptHash).toHaveBeenCalledTimes(1)
        expect(bcryptHash).toHaveBeenCalledWith(DOCTOR_PASSWORD, 10)
      })

      it('should call JwtService.sign twice with correct payload', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)
        const { mockKnexFn } = buildSuccessKnex()

        const signPayloads: Array<Record<string, unknown>> = []
        const mockJwtService = {
          sign: jest.fn().mockImplementation((payload) => {
            signPayloads.push({ ...payload })
            return 'some-token'
          }),
        }

        const mockEmailService = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) }

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            DoctorAuthService,
            { provide: KNEX, useValue: mockKnexFn },
            { provide: JwtService, useValue: mockJwtService },
            { provide: EmailService, useValue: mockEmailService },
          ],
        }).compile()

        const service = module.get<DoctorAuthService>(DoctorAuthService)
        await service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG)

        expect(mockJwtService.sign).toHaveBeenCalledTimes(2)
        for (const payload of signPayloads) {
          expect(payload.sub).toBe(CREATED_DOCTOR.id)
          expect(payload.type).toBe('doctor')
          expect(payload.role).toBe('doctor')
          expect(payload.tenantId).toBe(CREATED_TENANT.id)
        }
      })

      it('should sign access token with JWT_SECRET and refresh token with JWT_REFRESH_SECRET', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)
        const { mockKnexFn } = buildSuccessKnex()

        const signCalls: Array<{ secret: string; expiresIn: string }> = []
        const mockJwtService = {
          sign: jest.fn().mockImplementation((_payload, options) => {
            signCalls.push(options)
            return 'some-token'
          }),
        }

        const mockEmailService = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) }

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            DoctorAuthService,
            { provide: KNEX, useValue: mockKnexFn },
            { provide: JwtService, useValue: mockJwtService },
            { provide: EmailService, useValue: mockEmailService },
          ],
        }).compile()

        const service = module.get<DoctorAuthService>(DoctorAuthService)
        await service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG)

        expect(signCalls).toHaveLength(2)
        expect(signCalls[0].secret).toBe('test-secret-at-least-16-chars')
        expect(signCalls[1].secret).toBe('test-refresh-secret-at-least-16')
      })

      it('should create tenant, doctor, agent_settings and update invite in transaction', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)
        const inviteBuilder = buildBuilder(PENDING_INVITE)
        const trxFn = buildTransactionMock({})

        const mockKnexFn = jest.fn().mockReturnValueOnce(inviteBuilder) as jest.Mock & {
          transaction: jest.Mock
        }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

        const { service } = await createModule(mockKnexFn)
        await service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG)

        expect(trxFn).toHaveBeenCalledTimes(6)
        expect(trxFn).toHaveBeenNthCalledWith(1, 'tenants')
        expect(trxFn).toHaveBeenNthCalledWith(2, 'doctors')
        expect(trxFn).toHaveBeenNthCalledWith(3, 'tenants')
        expect(trxFn).toHaveBeenNthCalledWith(4, 'doctors')
        expect(trxFn).toHaveBeenNthCalledWith(5, 'agent_settings')
        expect(trxFn).toHaveBeenNthCalledWith(6, 'invites')
      })

      it('should insert agent_settings with enabled=false on invite acceptance (BUG-01 fix)', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)

        // Capture the exact payload passed to agent_settings.insert()
        const agentSettingsInsertBuilder = {
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([1]),
        }

        const tenantCheckBuilder = buildBuilder(undefined)
        const doctorCheckBuilder = buildBuilder(undefined)
        const tenantInsertBuilder = buildBuilder(undefined, [CREATED_TENANT])
        const doctorInsertBuilder = buildBuilder(undefined, [CREATED_DOCTOR])
        const inviteUpdateBuilder = buildBuilder(undefined)

        let trxCallCount = 0
        const trxFn = jest.fn().mockImplementation((_tableName: string) => {
          trxCallCount++
          if (trxCallCount === 1) return tenantCheckBuilder
          if (trxCallCount === 2) return doctorCheckBuilder
          if (trxCallCount === 3) return tenantInsertBuilder
          if (trxCallCount === 4) return doctorInsertBuilder
          if (trxCallCount === 5) return agentSettingsInsertBuilder
          if (trxCallCount === 6) return inviteUpdateBuilder
          return buildBuilder(undefined)
        }) as jest.Mock & { fn: { now: jest.Mock } }
        trxFn.fn = { now: jest.fn().mockReturnValue('NOW()') }

        const inviteBuilder = buildBuilder(PENDING_INVITE)
        const mockKnexFn = jest.fn().mockReturnValueOnce(inviteBuilder) as jest.Mock & {
          transaction: jest.Mock
        }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

        const { service } = await createModule(mockKnexFn)
        await service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG)

        expect(agentSettingsInsertBuilder.insert).toHaveBeenCalledWith(
          expect.objectContaining({ enabled: false }),
        )
      })
    })

    describe('Erro: token não encontrado', () => {
      it('should throw NotFoundException when invite does not exist', async () => {
        const inviteBuilder = buildBuilder(undefined)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder) as jest.Mock & {
          transaction: jest.Mock
        }
        mockKnexFn.transaction = jest.fn()

        const { service } = await createModule(mockKnexFn)

        await expect(
          service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG),
        ).rejects.toThrow(new NotFoundException('Convite não encontrado'))
      })

      it('should not start transaction when invite is not found', async () => {
        const inviteBuilder = buildBuilder(undefined)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder) as jest.Mock & {
          transaction: jest.Mock
        }
        mockKnexFn.transaction = jest.fn()

        const { service } = await createModule(mockKnexFn)

        await expect(
          service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG),
        ).rejects.toThrow(NotFoundException)

        expect(mockKnexFn.transaction).not.toHaveBeenCalled()
      })
    })

    describe('Erro: token já utilizado', () => {
      it('should throw BadRequestException when invite status is "accepted"', async () => {
        const inviteBuilder = buildBuilder(ACCEPTED_INVITE)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder) as jest.Mock & {
          transaction: jest.Mock
        }
        mockKnexFn.transaction = jest.fn()

        const { service } = await createModule(mockKnexFn)

        await expect(
          service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG),
        ).rejects.toThrow(new BadRequestException('Este convite já foi utilizado'))
      })
    })

    describe('Erro: token expirado', () => {
      it('should throw BadRequestException when expires_at is in the past', async () => {
        const inviteBuilder = buildBuilder(EXPIRED_INVITE)
        const mockKnexFn = jest.fn().mockReturnValue(inviteBuilder) as jest.Mock & {
          transaction: jest.Mock
        }
        mockKnexFn.transaction = jest.fn()

        const { service } = await createModule(mockKnexFn)

        await expect(
          service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG),
        ).rejects.toThrow(new BadRequestException('Convite expirado'))
      })
    })

    describe('Erro: slug já em uso', () => {
      it('should throw ConflictException("Este slug já está em uso. Escolha outro.") when tenant with slug exists', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)

        const inviteBuilder = buildBuilder(PENDING_INVITE)
        const trxFn = buildTransactionMock({
          existingTenant: { id: 'other-tenant', slug: DOCTOR_SLUG, name: 'Outro' },
        })

        const mockKnexFn = jest.fn().mockReturnValueOnce(inviteBuilder) as jest.Mock & {
          transaction: jest.Mock
        }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

        const { service } = await createModule(mockKnexFn)

        await expect(
          service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG),
        ).rejects.toThrow(new ConflictException('Este slug já está em uso. Escolha outro.'))
      })
    })

    describe('Erro: email do doutor já cadastrado', () => {
      it('should throw ConflictException("Este email já possui um portal cadastrado") when doctor email exists', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)

        const inviteBuilder = buildBuilder(PENDING_INVITE)
        const trxFn = buildTransactionMock({
          existingTenant: undefined,
          existingDoctor: { id: 'existing-doctor', email: PENDING_INVITE.email },
        })

        const mockKnexFn = jest.fn().mockReturnValueOnce(inviteBuilder) as jest.Mock & {
          transaction: jest.Mock
        }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

        const { service } = await createModule(mockKnexFn)

        await expect(
          service.acceptDoctorInvite(VALID_TOKEN, DOCTOR_NAME, DOCTOR_PASSWORD, DOCTOR_SLUG),
        ).rejects.toThrow(new ConflictException('Este email já possui um portal cadastrado'))
      })
    })
  })

  // =========================================================================
  // US-1.6 — resolveEmail
  // =========================================================================

  describe('US-1.6 — resolveEmail', () => {
    describe('Happy path: doutor ativo encontrado', () => {
      it('should return { slug, name } when active doctor and tenant exist', async () => {
        const doctorBuilder = buildBuilder(ACTIVE_DOCTOR)
        const tenantBuilder = buildBuilder(CREATED_TENANT)

        const mockKnexFn = buildKnexFn(doctorBuilder, tenantBuilder)

        const { service } = await createModule(mockKnexFn)
        const result = await service.resolveEmail(DOCTOR_EMAIL)

        expect(result).toEqual({ slug: CREATED_TENANT.slug, name: CREATED_TENANT.name })
      })

      it('should query doctors with { email, status: "active" }', async () => {
        const doctorBuilder = buildBuilder(ACTIVE_DOCTOR)
        const tenantBuilder = buildBuilder(CREATED_TENANT)

        const mockKnexFn = buildKnexFn(doctorBuilder, tenantBuilder)

        const { service } = await createModule(mockKnexFn)
        await service.resolveEmail(DOCTOR_EMAIL)

        expect(mockKnexFn).toHaveBeenCalledWith('doctors')
        expect(doctorBuilder.where).toHaveBeenCalledWith({ email: DOCTOR_EMAIL, status: 'active' })
        expect(doctorBuilder.first).toHaveBeenCalled()
      })
    })

    describe('Happy path: convite pendente encontrado', () => {
      it('should return { hasPendingInvite: true } when doctor not active but has pending invite', async () => {
        const doctorBuilder = buildBuilder(undefined)
        const inviteBuilder = buildBuilder({ ...PENDING_INVITE, type: 'doctor' })

        const mockKnexFn = buildKnexFn(doctorBuilder, inviteBuilder)

        const { service } = await createModule(mockKnexFn)
        const result = await service.resolveEmail(DOCTOR_EMAIL)

        expect(result).toEqual({ hasPendingInvite: true })
      })
    })

    describe('Erro: nenhuma conta encontrada', () => {
      it('should throw NotFoundException when no active doctor and no pending invite', async () => {
        const doctorBuilder = buildBuilder(undefined)
        const inviteBuilder = buildBuilder(undefined)

        const mockKnexFn = buildKnexFn(doctorBuilder, inviteBuilder)

        const { service } = await createModule(mockKnexFn)

        await expect(service.resolveEmail('notfound@example.com')).rejects.toThrow(
          new NotFoundException('Nenhuma conta encontrada para este e-mail'),
        )
      })
    })

    describe('Erro: doutor existe mas tenant não', () => {
      it('should throw NotFoundException with same message when doctor found but tenant missing', async () => {
        const doctorBuilder = buildBuilder(ACTIVE_DOCTOR)
        const tenantBuilder = buildBuilder(undefined)

        const mockKnexFn = buildKnexFn(doctorBuilder, tenantBuilder)

        const { service } = await createModule(mockKnexFn)

        await expect(service.resolveEmail(DOCTOR_EMAIL)).rejects.toThrow(
          new NotFoundException('Nenhuma conta encontrada para este e-mail'),
        )
      })

      it('should not leak internal state — same message as "email not found"', async () => {
        const doctorBuilder = buildBuilder(ACTIVE_DOCTOR)
        const tenantBuilder = buildBuilder(undefined)

        const mockKnexFn = buildKnexFn(doctorBuilder, tenantBuilder)

        const { service } = await createModule(mockKnexFn)

        let errorMessage = ''
        try {
          await service.resolveEmail(DOCTOR_EMAIL)
        } catch (err) {
          errorMessage = (err as Error).message
        }

        expect(errorMessage).toBe('Nenhuma conta encontrada para este e-mail')
      })
    })
  })

  // =========================================================================
  // US-1.6 — loginDoctor
  // =========================================================================

  describe('US-1.6 — loginDoctor', () => {
    describe('Happy path', () => {
      function buildLoginKnex() {
        const doctorBuilder = buildBuilder(ACTIVE_DOCTOR)
        const tenantBuilder = buildBuilder(CREATED_TENANT)
        const updateBuilder = buildBuilder(undefined)

        const mockKnexFn = buildKnexFn(doctorBuilder, tenantBuilder, updateBuilder)

        return { mockKnexFn, doctorBuilder, tenantBuilder, updateBuilder }
      }

      it('should return { accessToken, refreshToken, doctor, tenant } on valid credentials', async () => {
        bcryptCompare.mockResolvedValue(true as never)
        const { mockKnexFn } = buildLoginKnex()

        const { service } = await createModule(mockKnexFn)
        const result = await service.loginDoctor(DOCTOR_EMAIL, DOCTOR_PASSWORD)

        expect(result).toEqual({
          accessToken: 'access-token-stub',
          refreshToken: 'refresh-token-stub',
          doctor: {
            id: ACTIVE_DOCTOR.id,
            name: ACTIVE_DOCTOR.name,
            email: ACTIVE_DOCTOR.email,
          },
          tenant: {
            id: CREATED_TENANT.id,
            slug: CREATED_TENANT.slug,
            name: CREATED_TENANT.name,
          },
        })
      })

      it('should update last_login_at AFTER emitting tokens', async () => {
        bcryptCompare.mockResolvedValue(true as never)

        const doctorBuilder = buildBuilder(ACTIVE_DOCTOR)
        const tenantBuilder = buildBuilder(CREATED_TENANT)
        const updateBuilder = buildBuilder(undefined)

        const callOrder: string[] = []

        updateBuilder.update.mockImplementation(() => {
          callOrder.push('knex-update')
          return Promise.resolve(1)
        })

        const mockKnexFn = buildKnexFn(doctorBuilder, tenantBuilder, updateBuilder)

        const mockJwtService = {
          sign: jest.fn().mockImplementation(() => {
            callOrder.push('jwt-sign')
            return 'some-token'
          }),
        }

        const mockEmailService = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) }

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            DoctorAuthService,
            { provide: KNEX, useValue: mockKnexFn },
            { provide: JwtService, useValue: mockJwtService },
            { provide: EmailService, useValue: mockEmailService },
          ],
        }).compile()

        const service = module.get<DoctorAuthService>(DoctorAuthService)
        await service.loginDoctor(DOCTOR_EMAIL, DOCTOR_PASSWORD)

        expect(callOrder).toEqual(['jwt-sign', 'jwt-sign', 'knex-update'])
      })

      it('should sign JWT payload with { sub: doctor.id, type: "doctor", role: "doctor", tenantId }', async () => {
        bcryptCompare.mockResolvedValue(true as never)

        const doctorBuilder = buildBuilder(ACTIVE_DOCTOR)
        const tenantBuilder = buildBuilder(CREATED_TENANT)
        const updateBuilder = buildBuilder(undefined)

        const mockKnexFn = buildKnexFn(doctorBuilder, tenantBuilder, updateBuilder)

        const signPayloads: Array<Record<string, unknown>> = []
        const mockJwtService = {
          sign: jest.fn().mockImplementation((payload) => {
            signPayloads.push({ ...payload })
            return 'some-token'
          }),
        }

        const mockEmailService = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) }

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            DoctorAuthService,
            { provide: KNEX, useValue: mockKnexFn },
            { provide: JwtService, useValue: mockJwtService },
            { provide: EmailService, useValue: mockEmailService },
          ],
        }).compile()

        const service = module.get<DoctorAuthService>(DoctorAuthService)
        await service.loginDoctor(DOCTOR_EMAIL, DOCTOR_PASSWORD)

        expect(mockJwtService.sign).toHaveBeenCalledTimes(2)
        for (const payload of signPayloads) {
          expect(payload.sub).toBe(ACTIVE_DOCTOR.id)
          expect(payload.type).toBe('doctor')
          expect(payload.role).toBe('doctor')
          expect(payload.tenantId).toBe(ACTIVE_DOCTOR.tenant_id)
        }
      })
    })

    describe('Erro: doutor não encontrado ou sem password_hash', () => {
      it('should throw UnauthorizedException("Credenciais inválidas") when doctor not found', async () => {
        const mockKnexFn = buildKnexFn(buildBuilder(undefined))

        const { service } = await createModule(mockKnexFn)

        await expect(service.loginDoctor(DOCTOR_EMAIL, DOCTOR_PASSWORD)).rejects.toThrow(
          new UnauthorizedException('Credenciais inválidas'),
        )
      })

      it('should throw UnauthorizedException when doctor has no password_hash', async () => {
        const doctorWithoutHash = { ...ACTIVE_DOCTOR, password_hash: undefined }
        const mockKnexFn = buildKnexFn(buildBuilder(doctorWithoutHash))

        const { service } = await createModule(mockKnexFn)

        await expect(service.loginDoctor(DOCTOR_EMAIL, DOCTOR_PASSWORD)).rejects.toThrow(
          new UnauthorizedException('Credenciais inválidas'),
        )
      })

      it('should not call bcrypt.compare when doctor not found', async () => {
        const mockKnexFn = buildKnexFn(buildBuilder(undefined))

        const { service } = await createModule(mockKnexFn)

        await expect(service.loginDoctor(DOCTOR_EMAIL, DOCTOR_PASSWORD)).rejects.toThrow(
          UnauthorizedException,
        )

        expect(bcryptCompare).not.toHaveBeenCalled()
      })
    })

    describe('Erro: senha incorreta', () => {
      it('should throw UnauthorizedException("Credenciais inválidas") when bcrypt.compare returns false', async () => {
        bcryptCompare.mockResolvedValue(false as never)
        const mockKnexFn = buildKnexFn(buildBuilder(ACTIVE_DOCTOR))

        const { service } = await createModule(mockKnexFn)

        await expect(service.loginDoctor(DOCTOR_EMAIL, 'wrong-password')).rejects.toThrow(
          new UnauthorizedException('Credenciais inválidas'),
        )
      })
    })

    describe('Erro: tenant não encontrado', () => {
      it('should throw NotFoundException("Portal do doutor não encontrado") when tenant missing', async () => {
        bcryptCompare.mockResolvedValue(true as never)

        const mockKnexFn = buildKnexFn(buildBuilder(ACTIVE_DOCTOR), buildBuilder(undefined))

        const { service } = await createModule(mockKnexFn)

        await expect(service.loginDoctor(DOCTOR_EMAIL, DOCTOR_PASSWORD)).rejects.toThrow(
          new NotFoundException('Portal do doutor não encontrado'),
        )
      })
    })
  })

  // =========================================================================
  // US-1.7 — forgotPassword
  // =========================================================================

  describe('US-1.7 — forgotPassword', () => {
    const SAFE_MESSAGE = 'Se este e-mail estiver cadastrado, você receberá as instruções em breve.'

    describe('Happy path: email encontrado', () => {
      function buildForgotPasswordKnex() {
        const doctorBuilder = buildBuilder(ACTIVE_DOCTOR)
        const invalidateBuilder = buildBuilder(undefined)
        const insertBuilder = buildBuilder(undefined, [1])

        const mockKnexFn = buildKnexFn(
          doctorBuilder,    // knex('doctors').where().first()
          invalidateBuilder, // knex('invites').where().update()
          insertBuilder,     // knex('invites').insert()
        )

        return { mockKnexFn, invalidateBuilder, insertBuilder }
      }

      it('should return the safe message when email is found', async () => {
        const { mockKnexFn } = buildForgotPasswordKnex()

        const { service } = await createModule(mockKnexFn)
        const result = await service.forgotPassword(DOCTOR_EMAIL)

        expect(result).toEqual({ message: SAFE_MESSAGE })
      })

      it('should invalidate previous pending tokens before inserting new one', async () => {
        const { mockKnexFn, invalidateBuilder } = buildForgotPasswordKnex()

        const { service } = await createModule(mockKnexFn)
        await service.forgotPassword(DOCTOR_EMAIL)

        expect(invalidateBuilder.where).toHaveBeenCalledWith({
          email: DOCTOR_EMAIL,
          type: 'password_reset',
          status: 'pending',
        })
        expect(invalidateBuilder.update).toHaveBeenCalledWith({ status: 'expired' })
      })

      it('should insert a new password_reset invite', async () => {
        const { mockKnexFn, insertBuilder } = buildForgotPasswordKnex()

        const { service } = await createModule(mockKnexFn)
        await service.forgotPassword(DOCTOR_EMAIL)

        expect(insertBuilder.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'password_reset',
            email: DOCTOR_EMAIL,
            status: 'pending',
            token: expect.any(String),
            expires_at: expect.any(Date),
          }),
        )
      })

      it('should call EmailService.sendPasswordReset with correct params', async () => {
        const { mockKnexFn } = buildForgotPasswordKnex()

        const { service, emailService } = await createModule(mockKnexFn)
        await service.forgotPassword(DOCTOR_EMAIL)

        expect(emailService.sendPasswordReset).toHaveBeenCalledWith({
          to: DOCTOR_EMAIL,
          token: expect.any(String),
          userType: 'doctor',
        })
      })

      it('should still return the safe message even if EmailService throws', async () => {
        const mockKnexFn = buildKnexFn(
          buildBuilder(ACTIVE_DOCTOR),
          buildBuilder(undefined),
          buildBuilder(undefined, [1]),
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
            DoctorAuthService,
            { provide: KNEX, useValue: mockKnexFn },
            { provide: JwtService, useValue: mockJwtService },
            { provide: EmailService, useValue: mockEmailService },
          ],
        }).compile()

        const service = module.get<DoctorAuthService>(DoctorAuthService)
        const result = await service.forgotPassword(DOCTOR_EMAIL)

        expect(result).toEqual({ message: SAFE_MESSAGE })
      })
    })

    describe('Happy path: email não encontrado', () => {
      it('should return the same safe message without creating tokens or sending email', async () => {
        const mockKnexFn = buildKnexFn(buildBuilder(undefined))

        const { service, emailService } = await createModule(mockKnexFn)
        const result = await service.forgotPassword('notfound@example.com')

        expect(result).toEqual({ message: SAFE_MESSAGE })
        expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
      })

      it('should never reveal whether the email exists or not', async () => {
        const mockKnexFnNotFound = buildKnexFn(buildBuilder(undefined))

        const mockKnexFnFound = buildKnexFn(
          buildBuilder(ACTIVE_DOCTOR),
          buildBuilder(undefined),
          buildBuilder(undefined, [1]),
        )

        const { service: serviceNotFound } = await createModule(mockKnexFnNotFound)
        const { service: serviceFound } = await createModule(mockKnexFnFound)

        const resultNotFound = await serviceNotFound.forgotPassword('notfound@example.com')
        const resultFound = await serviceFound.forgotPassword(DOCTOR_EMAIL)

        expect(resultNotFound.message).toBe(resultFound.message)
      })
    })
  })

  // =========================================================================
  // US-1.7 — resetPassword
  // =========================================================================

  describe('US-1.7 — resetPassword', () => {
    describe('Happy path', () => {
      function buildResetPasswordKnex(doctorRow?: unknown) {
        const inviteBuilder = buildBuilder(PENDING_RESET_INVITE)
        const trxFn = buildResetPasswordTransactionMock({ doctorRow: doctorRow ?? ACTIVE_DOCTOR })

        const mockKnexFn = buildKnexFn(inviteBuilder) as KnexFnMock & { transaction: jest.Mock }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

        return { mockKnexFn, trxFn }
      }

      it('should return { message: "Senha redefinida com sucesso" } on valid token', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)
        const { mockKnexFn } = buildResetPasswordKnex()

        const { service } = await createModule(mockKnexFn)
        const result = await service.resetPassword(RESET_TOKEN, 'NewSecurePass123!')

        expect(result).toEqual({ message: 'Senha redefinida com sucesso' })
      })

      it('should call bcrypt.hash with (newPassword, 10) before transaction', async () => {
        const hashCallOrder: string[] = []

        bcryptHash.mockImplementation(async () => {
          hashCallOrder.push('bcrypt-hash')
          return PASSWORD_HASH as never
        })

        let transactionStarted = false
        const mockKnexFn = buildKnexFn(buildBuilder(PENDING_RESET_INVITE)) as KnexFnMock & { transaction: jest.Mock }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => {
          hashCallOrder.push('transaction-start')
          transactionStarted = true
          const trxFn = buildResetPasswordTransactionMock({})
          return cb(trxFn)
        })

        const { service } = await createModule(mockKnexFn)
        await service.resetPassword(RESET_TOKEN, 'NewSecurePass123!')

        expect(bcryptHash).toHaveBeenCalledWith('NewSecurePass123!', 10)
        expect(hashCallOrder[0]).toBe('bcrypt-hash')
        expect(hashCallOrder[1]).toBe('transaction-start')
        expect(transactionStarted).toBe(true)
      })

      it('should use forUpdate() when fetching doctor inside transaction', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)
        const doctorFindBuilder = buildBuilder(ACTIVE_DOCTOR)
        const doctorUpdateBuilder = buildBuilder(undefined)
        const inviteUpdateBuilder = buildBuilder(undefined)

        let trxCallCount = 0
        const trxFn = jest.fn().mockImplementation((_tableName: string) => {
          trxCallCount++
          if (trxCallCount === 1) return doctorFindBuilder
          if (trxCallCount === 2) return doctorUpdateBuilder
          if (trxCallCount === 3) return inviteUpdateBuilder
          return buildBuilder(undefined)
        }) as jest.Mock & { fn: { now: jest.Mock } }
        trxFn.fn = { now: jest.fn().mockReturnValue('NOW()') }

        const mockKnexFn = buildKnexFn(buildBuilder(PENDING_RESET_INVITE)) as KnexFnMock & { transaction: jest.Mock }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

        const { service } = await createModule(mockKnexFn)
        await service.resetPassword(RESET_TOKEN, 'NewSecurePass123!')

        expect(doctorFindBuilder.forUpdate).toHaveBeenCalled()
      })

      it('should update doctor password_hash and mark invite as accepted in same transaction', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)
        const { mockKnexFn, trxFn } = buildResetPasswordKnex()

        const { service } = await createModule(mockKnexFn)
        await service.resetPassword(RESET_TOKEN, 'NewSecurePass123!')

        // trxFn must have been called 3 times: doctors (find), doctors (update), invites (update)
        expect(trxFn).toHaveBeenCalledTimes(3)
        expect(trxFn).toHaveBeenNthCalledWith(1, 'doctors')
        expect(trxFn).toHaveBeenNthCalledWith(2, 'doctors')
        expect(trxFn).toHaveBeenNthCalledWith(3, 'invites')
      })
    })

    describe('Erro: token inválido ou expirado', () => {
      it('should throw BadRequestException("Token inválido ou expirado") when invite not found', async () => {
        const mockKnexFn = buildKnexFn(buildBuilder(undefined)) as KnexFnMock & { transaction: jest.Mock }
        mockKnexFn.transaction = jest.fn()

        const { service } = await createModule(mockKnexFn)

        await expect(service.resetPassword('invalid-token', 'NewPass123!')).rejects.toThrow(
          new BadRequestException('Token inválido ou expirado'),
        )
      })

      it('should not start transaction when token is invalid', async () => {
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
      it('should throw NotFoundException("Conta não encontrada") when doctor not found inside trx', async () => {
        bcryptHash.mockResolvedValue(PASSWORD_HASH as never)
        // Passar null — undefined aciona o valor default da desestruturação ({ doctorRow = ACTIVE_DOCTOR })
        const trxFn = buildResetPasswordTransactionMock({ doctorRow: null })

        const mockKnexFn = buildKnexFn(buildBuilder(PENDING_RESET_INVITE)) as KnexFnMock & { transaction: jest.Mock }
        mockKnexFn.transaction = jest.fn().mockImplementation(async (cb) => cb(trxFn))

        const { service } = await createModule(mockKnexFn)

        await expect(service.resetPassword(RESET_TOKEN, 'NewPass123!')).rejects.toThrow(
          new NotFoundException('Conta não encontrada'),
        )
      })
    })
  })

  // =========================================================================
  // US-1.8 — refreshToken (doctor)
  // =========================================================================

  describe('US-1.8 — refreshToken', () => {
    const DOCTOR_REFRESH_PAYLOAD = {
      sub: ACTIVE_DOCTOR.id,
      type: 'doctor',
      role: 'doctor',
      tenantId: CREATED_TENANT.id,
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
          DoctorAuthService,
          { provide: KNEX, useValue: jest.fn() },
          { provide: JwtService, useValue: mockJwtService },
          { provide: EmailService, useValue: { sendPasswordReset: jest.fn() } },
        ],
      }).compile()

      return {
        service: module.get<DoctorAuthService>(DoctorAuthService),
        jwtService: module.get<JwtService>(JwtService),
      }
    }

    describe('Happy path', () => {
      it('should return { accessToken, refreshToken } on valid token', async () => {
        const { service } = await createRefreshModule(() => DOCTOR_REFRESH_PAYLOAD)

        const result = await service.refreshToken('valid-refresh-token')

        expect(result).toEqual({
          accessToken: 'new-access-token-stub',
          refreshToken: 'new-refresh-token-stub',
        })
      })

      it('should preserve tenantId in re-emitted payload', async () => {
        const signPayloads: Array<Record<string, unknown>> = []

        const mockJwtService = {
          verify: jest.fn().mockReturnValue(DOCTOR_REFRESH_PAYLOAD),
          sign: jest.fn().mockImplementation((payload) => {
            signPayloads.push({ ...payload })
            return 'some-token'
          }),
        }

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            DoctorAuthService,
            { provide: KNEX, useValue: jest.fn() },
            { provide: JwtService, useValue: mockJwtService },
            { provide: EmailService, useValue: { sendPasswordReset: jest.fn() } },
          ],
        }).compile()

        const service = module.get<DoctorAuthService>(DoctorAuthService)
        await service.refreshToken('valid-refresh-token')

        for (const payload of signPayloads) {
          expect(payload.tenantId).toBe(CREATED_TENANT.id)
          expect(payload.sub).toBe(ACTIVE_DOCTOR.id)
          expect(payload.type).toBe('doctor')
          expect(payload.role).toBe('doctor')
        }
      })

      it('should re-emit with JWT_SECRET for access and JWT_REFRESH_SECRET for refresh', async () => {
        const signCalls: Array<{ secret: string; expiresIn: string }> = []

        const mockJwtService = {
          verify: jest.fn().mockReturnValue(DOCTOR_REFRESH_PAYLOAD),
          sign: jest.fn().mockImplementation((_payload, options) => {
            signCalls.push(options)
            return 'some-token'
          }),
        }

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            DoctorAuthService,
            { provide: KNEX, useValue: jest.fn() },
            { provide: JwtService, useValue: mockJwtService },
            { provide: EmailService, useValue: { sendPasswordReset: jest.fn() } },
          ],
        }).compile()

        const service = module.get<DoctorAuthService>(DoctorAuthService)
        await service.refreshToken('valid-refresh-token')

        expect(signCalls[0].secret).toBe('test-secret-at-least-16-chars')
        expect(signCalls[0].expiresIn).toBe('15m')
        expect(signCalls[1].secret).toBe('test-refresh-secret-at-least-16')
        expect(signCalls[1].expiresIn).toBe('7d')
      })
    })

    describe('Erro: token inválido ou expirado', () => {
      it('should throw UnauthorizedException when jwtService.verify throws', async () => {
        const { service } = await createRefreshModule(() => {
          throw new Error('jwt expired')
        })

        await expect(service.refreshToken('expired-token')).rejects.toThrow(
          new UnauthorizedException('Refresh token inválido ou expirado'),
        )
      })
    })

    describe('Segurança: cross-domain', () => {
      it('should throw UnauthorizedException when type is "agency" (agency token on doctor endpoint)', async () => {
        const agencyPayload = { ...DOCTOR_REFRESH_PAYLOAD, type: 'agency' }
        const { service } = await createRefreshModule(() => agencyPayload)

        await expect(service.refreshToken('agency-refresh-token')).rejects.toThrow(
          new UnauthorizedException('Refresh token inválido ou expirado'),
        )
      })
    })
  })
})
