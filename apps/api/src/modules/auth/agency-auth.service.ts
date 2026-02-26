import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, Inject, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as crypto from 'node:crypto'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import { env } from '@/config/env'
import { EmailService } from '@/modules/email/email.service'

interface AgencyMemberRow {
  id: string
  email: string
  password_hash: string | null
  name: string
  role: 'agency_admin' | 'agency_member'
  status: 'pending' | 'active' | 'inactive'
  last_login_at: Date | null
  created_at: Date
  updated_at: Date
}

interface InviteRow {
  id: string
  type: string
  email: string
  token: string
  status: 'pending' | 'accepted' | 'expired'
  expires_at: Date
  accepted_at?: Date | null
}

@Injectable()
export class AgencyAuthService {
  private readonly logger = new Logger(AgencyAuthService.name)

  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async loginAgency(email: string, password: string) {
    const member = await this.knex<AgencyMemberRow>('agency_members')
      .where({ email, status: 'active' })
      .first()

    if (!member?.password_hash) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const passwordMatch = await bcrypt.compare(password, member.password_hash)
    if (!passwordMatch) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const payload = {
      sub: member.id,
      type: 'agency' as const,
      role: member.role,
    }

    const accessToken = this.jwtService.sign(payload, {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
    })

    const refreshToken = this.jwtService.sign(payload, {
      secret: env.JWT_REFRESH_SECRET,
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    })

    await this.knex('agency_members').where({ id: member.id }).update({
      last_login_at: this.knex.fn.now(),
    })

    return {
      accessToken,
      refreshToken,
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
      },
    }
  }

  // US-1.7: Solicitar redefinição de senha (idempotente — sempre retorna 200)
  async forgotPassword(email: string): Promise<{ message: string }> {
    const member = await this.knex<AgencyMemberRow>('agency_members')
      .where({ email, status: 'active' })
      .first()

    // Nunca revelar se o e-mail existe (segurança)
    if (!member) {
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
      await this.emailService.sendPasswordReset({ to: email, token, userType: 'agency' })
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail de reset para ${email}: ${(err as Error).message}`)
    }

    this.logger.log(`Solicitação de reset de senha para agency member: ${email}`)
    return { message: 'Se este e-mail estiver cadastrado, você receberá as instruções em breve.' }
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
      // Buscar e travar o membro dentro da transação (evita race condition)
      const member = await trx<AgencyMemberRow>('agency_members')
        .where({ email: invite.email, status: 'active' })
        .forUpdate()
        .first()

      if (!member) {
        throw new NotFoundException('Conta não encontrada')
      }

      await trx('agency_members').where({ id: member.id }).update({ password_hash: passwordHash })
      await trx<InviteRow>('invites').where({ id: invite.id }).update({
        status: 'accepted',
        accepted_at: trx.fn.now(),
      })
    })

    this.logger.log(`Senha redefinida para agency member: ${invite.email}`)
    return { message: 'Senha redefinida com sucesso' }
  }

  // US-1.8: Renovar par de tokens (agency)
  async refreshToken(token: string) {
    let payload: { sub: string; type: string; role: string }
    try {
      payload = this.jwtService.verify(token, { secret: env.JWT_REFRESH_SECRET })
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado')
    }

    if (payload.type !== 'agency') {
      throw new UnauthorizedException('Refresh token inválido ou expirado')
    }

    const newPayload = {
      sub: payload.sub,
      type: 'agency' as const,
      role: payload.role as 'agency_admin' | 'agency_member',
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
}
