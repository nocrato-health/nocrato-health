import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as crypto from 'node:crypto'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import { env } from '@/config/env'
import { EmailService } from '@/modules/email/email.service'

interface InviteRow {
  id: string
  type: 'agency_member' | 'doctor' | 'password_reset'
  email: string
  token: string
  status: 'pending' | 'accepted' | 'expired'
  expires_at: Date
  accepted_at?: Date | null
}

interface TenantRow {
  id: string
  slug: string
  name: string
  status?: string
  invite_id?: string
}

interface DoctorRow {
  id: string
  tenant_id: string
  email: string
  name: string
  password_hash?: string
  status?: string
  onboarding_completed?: boolean
  last_login_at?: unknown
  crm: string | null        // nullable após migration 015
  crm_state: string | null  // nullable após migration 015
  working_hours: object | null  // nullable após migration 015
}

@Injectable()
export class DoctorAuthService {
  private readonly logger = new Logger(DoctorAuthService.name)

  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  // US-1.6: Resolve email antes do login (público — não revela dados sensíveis)
  async resolveEmail(email: string): Promise<
    { slug: string; name: string } | { hasPendingInvite: true }
  > {
    // 1. Doutor ativo com email
    const doctor = await this.knex<DoctorRow>('doctors')
      .where({ email, status: 'active' })
      .first()

    if (doctor) {
      const tenant = await this.knex<TenantRow>('tenants')
        .where({ id: doctor.tenant_id })
        .first()

      if (!tenant) throw new NotFoundException('Nenhuma conta encontrada para este e-mail')
      return { slug: tenant.slug, name: tenant.name }
    }

    // 2. Convite pendente tipo 'doctor'
    const invite = await this.knex<InviteRow>('invites')
      .where({ email, type: 'doctor', status: 'pending' })
      .where('expires_at', '>', this.knex.fn.now())
      .first()

    if (invite) {
      return { hasPendingInvite: true }
    }

    throw new NotFoundException('Nenhuma conta encontrada para este e-mail')
  }

  // US-1.6: Login do doutor
  async loginDoctor(email: string, password: string) {
    const doctor = await this.knex<DoctorRow>('doctors')
      .where({ email, status: 'active' })
      .first()

    if (!doctor?.password_hash) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const passwordMatch = await bcrypt.compare(password, doctor.password_hash)
    if (!passwordMatch) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const tenant = await this.knex<TenantRow>('tenants')
      .where({ id: doctor.tenant_id })
      .first()

    if (!tenant) {
      throw new NotFoundException('Portal do doutor não encontrado')
    }

    const payload = {
      sub: doctor.id,
      type: 'doctor' as const,
      role: 'doctor' as const,
      tenantId: doctor.tenant_id,
    }

    const accessToken = this.jwtService.sign(payload, {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
    })

    const refreshToken = this.jwtService.sign(payload, {
      secret: env.JWT_REFRESH_SECRET,
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    })

    await this.knex('doctors').where({ id: doctor.id }).update({
      last_login_at: this.knex.fn.now(),
    })

    this.logger.log(`Doutor ${email} fez login no tenant ${tenant.slug}`)

    return {
      accessToken,
      refreshToken,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      },
    }
  }

  async validateDoctorInviteToken(token: string): Promise<{ email: string; valid: true }> {
    const invite = await this.knex<InviteRow>('invites')
      .where({ token, type: 'doctor' })
      .first()

    if (!invite) {
      throw new NotFoundException('Convite não encontrado')
    }

    if (invite.status !== 'pending') {
      throw new BadRequestException('Este convite já foi utilizado')
    }

    if (new Date(invite.expires_at) < new Date()) {
      throw new BadRequestException('Convite expirado')
    }

    return { email: invite.email, valid: true }
  }

  async acceptDoctorInvite(
    token: string,
    name: string,
    password: string,
    slug: string,
  ) {
    // 1. Buscar e validar invite (fora da transaction — leitura simples, sem writes)
    const invite = await this.knex<InviteRow>('invites')
      .where({ token, type: 'doctor' })
      .first()

    if (!invite) {
      throw new NotFoundException('Convite não encontrado')
    }

    if (invite.status !== 'pending') {
      throw new BadRequestException('Este convite já foi utilizado')
    }

    if (new Date(invite.expires_at) < new Date()) {
      throw new BadRequestException('Convite expirado')
    }

    // 2. Hash da senha antes da transaction (operação CPU-bound, não segura conexão do pool)
    const passwordHash = await bcrypt.hash(password, 10)

    // 3. Transação atômica: checks de unicidade + criação dos 3 registros + aceite do invite
    let doctorId: string
    let tenantId: string

    await this.knex.transaction(async (trx) => {
      // 3a. Verificar slug único dentro da trx (evita race condition entre requests concorrentes)
      const existingTenant = await trx<TenantRow>('tenants').where({ slug }).first()
      if (existingTenant) {
        throw new ConflictException('Este slug já está em uso. Escolha outro.')
      }

      // 3b. Verificar email único sem filtro de status (UNIQUE constraint é global)
      const existingDoctor = await trx<DoctorRow>('doctors').where({ email: invite.email }).first()
      if (existingDoctor) {
        throw new ConflictException('Este email já possui um portal cadastrado')
      }

      // 3c. Criar tenant
      const [tenant] = await trx<TenantRow>('tenants')
        .insert({
          slug,
          name,
          status: 'active',
          invite_id: invite.id,
        })
        .returning(['id', 'slug', 'name'])

      tenantId = tenant.id

      // 3d. Criar doctor (last_login_at dentro da trx para consistência)
      const [doctor] = await trx<DoctorRow>('doctors')
        .insert({
          tenant_id: tenantId,
          email: invite.email,
          password_hash: passwordHash,
          name,
          status: 'active',
          onboarding_completed: false,
          last_login_at: trx.fn.now(),
        })
        .returning(['id', 'tenant_id', 'email', 'name'])

      doctorId = doctor.id

      // 3e. Criar agent_settings com defaults
      await trx('agent_settings').insert({
        tenant_id: tenantId,
        welcome_message: '',
        personality: '',
        faq: '',
        appointment_rules: '',
        enabled: false,
        booking_mode: 'both',
      })

      // 3f. Marcar invite como aceito
      await trx<InviteRow>('invites').where({ id: invite.id }).update({
        status: 'accepted',
        accepted_at: trx.fn.now(),
      })
    })

    // 4. Emitir JWT (access + refresh) após commit da transação
    const payload = {
      sub: doctorId!,
      type: 'doctor' as const,
      role: 'doctor' as const,
      tenantId: tenantId!,
    }

    const accessToken = this.jwtService.sign(payload, {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
    })

    const refreshToken = this.jwtService.sign(payload, {
      secret: env.JWT_REFRESH_SECRET,
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    })

    this.logger.log(`Doutor ${invite.email} aceitou convite e criou portal: ${slug}`)

    return {
      accessToken,
      refreshToken,
      doctor: {
        id: doctorId!,
        name,
        email: invite.email,
      },
      tenant: {
        id: tenantId!,
        slug,
        name,
      },
    }
  }

  // US-1.7: Solicitar redefinição de senha (idempotente — nunca revela se e-mail existe)
  async forgotPassword(email: string): Promise<{ message: string }> {
    const doctor = await this.knex<DoctorRow>('doctors')
      .where({ email, status: 'active' })
      .first()

    if (!doctor) {
      return { message: 'Se este e-mail estiver cadastrado, você receberá as instruções em breve.' }
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    // Invalidar tokens pendentes anteriores antes de emitir o novo
    await this.knex<InviteRow>('invites')
      .where({ email, type: 'password_reset', status: 'pending' })
      .update({ status: 'expired' })

    await this.knex<InviteRow>('invites').insert({
      type: 'password_reset',
      email,
      token,
      status: 'pending',
      expires_at: expiresAt,
    })

    // Envio silencioso — falha de e-mail não pode revelar que o usuário existe
    try {
      await this.emailService.sendPasswordReset({ to: email, token, userType: 'doctor' })
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail de reset para ${email}: ${(err as Error).message}`)
    }

    this.logger.log(`Solicitação de reset de senha para doutor: ${email}`)
    return { message: 'Se este e-mail estiver cadastrado, você receberá as instruções em breve.' }
  }

  // US-1.8: Renovar par de tokens (doctor)
  async refreshToken(token: string) {
    let payload: { sub: string; type: string; role: string; tenantId: string }
    try {
      payload = this.jwtService.verify(token, { secret: env.JWT_REFRESH_SECRET })
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado')
    }

    if (payload.type !== 'doctor') {
      throw new UnauthorizedException('Refresh token inválido ou expirado')
    }

    const newPayload = {
      sub: payload.sub,
      type: 'doctor' as const,
      role: 'doctor' as const,
      tenantId: payload.tenantId,
    }

    const accessToken = this.jwtService.sign(newPayload, {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
    })

    const refreshToken = this.jwtService.sign(newPayload, {
      secret: env.JWT_REFRESH_SECRET,
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    })

    return { accessToken, refreshToken }
  }

  // US-1.7: Redefinir senha com token
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const invite = await this.knex<InviteRow>('invites')
      .where({ token, type: 'password_reset', status: 'pending' })
      .where('expires_at', '>', this.knex.fn.now())
      .first()

    if (!invite) {
      throw new BadRequestException('Token inválido ou expirado')
    }

    // Hash antes da transação (CPU-bound, não deve segurar conexão do pool)
    const passwordHash = await bcrypt.hash(newPassword, 10)

    await this.knex.transaction(async (trx) => {
      // Buscar e travar o doutor dentro da transação (evita race condition)
      const doctor = await trx<DoctorRow>('doctors')
        .where({ email: invite.email, status: 'active' })
        .forUpdate()
        .first()

      if (!doctor) {
        throw new NotFoundException('Conta não encontrada')
      }

      await trx('doctors').where({ id: doctor.id }).update({ password_hash: passwordHash })
      await trx<InviteRow>('invites').where({ id: invite.id }).update({
        status: 'accepted',
        accepted_at: trx.fn.now(),
      })
    })

    this.logger.log(`Senha redefinida para doutor: ${invite.email}`)
    return { message: 'Senha redefinida com sucesso' }
  }
}
