import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import * as crypto from 'node:crypto'
import * as bcrypt from 'bcrypt'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'
import { EmailService } from '@/modules/email/email.service'

interface InviteRow {
  id: string
  type: 'agency_member' | 'doctor'
  email: string
  invited_by: string
  token: string
  status: 'pending' | 'accepted' | 'expired'
  expires_at: Date
  accepted_at: Date | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

interface AgencyMemberRow {
  id: string
  email: string
  name: string
  password_hash: string | null
  role: 'agency_admin' | 'agency_member'
  status: 'pending' | 'active' | 'inactive'
}

interface DoctorRow {
  id: string
  email: string
  status: 'active' | 'inactive'
}

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name)

  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly emailService: EmailService,
  ) {}

  async inviteAgencyMember(email: string, invitedBy: string): Promise<{ message: string }> {
    // 1. Verificar se já existe agency_member com esse email (status != 'inactive')
    const existingMember = await this.knex<AgencyMemberRow>('agency_members')
      .where({ email })
      .whereNot({ status: 'inactive' })
      .first()

    if (existingMember) {
      throw new ConflictException('Este email já está cadastrado')
    }

    // 2. Verificar se já existe invite pendente para esse email com type = 'agency_member'
    const existingInvite = await this.knex<InviteRow>('invites')
      .where({ email, type: 'agency_member', status: 'pending' })
      .first()

    if (existingInvite) {
      throw new ConflictException('Já existe um convite pendente para este email')
    }

    // 3. Buscar dados do membro que está convidando (para o email)
    const inviter = await this.knex<AgencyMemberRow>('agency_members')
      .where({ id: invitedBy })
      .first()

    const invitedByName = inviter?.name ?? 'Um administrador'

    // 4. Gerar token
    const token = crypto.randomBytes(32).toString('hex')

    // 5. Calcular expires_at: agora + 7 dias
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // 6. Inserir invite
    await this.knex<InviteRow>('invites').insert({
      type: 'agency_member',
      email,
      invited_by: invitedBy,
      token,
      status: 'pending',
      expires_at: expiresAt,
    })

    // 7. Enviar email
    await this.emailService.sendInviteMember({ to: email, token, invitedByName })

    this.logger.log(`Convite agency_member enviado para ${email} por ${invitedBy}`)

    return { message: 'Convite enviado com sucesso' }
  }

  async validateInviteToken(token: string): Promise<{ email: string; valid: true }> {
    const invite = await this.knex<InviteRow>('invites')
      .where({ token, type: 'agency_member' })
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

  async acceptInvite(
    token: string,
    name: string,
    password: string,
  ): Promise<{ message: string }> {
    const invite = await this.knex<InviteRow>('invites')
      .where({ token, type: 'agency_member' })
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

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10)

    // Inserir membro e marcar invite como aceito de forma atômica
    await this.knex.transaction(async (trx) => {
      await trx<AgencyMemberRow>('agency_members').insert({
        email: invite.email,
        name,
        password_hash: passwordHash,
        role: 'agency_member',
        status: 'active',
      })

      await trx<InviteRow>('invites').where({ id: invite.id }).update({
        status: 'accepted',
        accepted_at: trx.fn.now(),
      })
    })

    this.logger.log(`Convite aceito por ${invite.email}`)

    return { message: 'Conta criada com sucesso. Faça login para continuar.' }
  }

  async inviteDoctor(email: string, invitedBy: string): Promise<{ message: string }> {
    // 1. Verificar se já existe doctor com esse email (sem filtro de status — UNIQUE é global)
    const existingDoctor = await this.knex<DoctorRow>('doctors')
      .where({ email })
      .first()

    if (existingDoctor) {
      throw new ConflictException('Este email já está cadastrado como doutor')
    }

    // 2. Verificar se já existe invite pendente para esse email com type = 'doctor'
    const existingInvite = await this.knex<InviteRow>('invites')
      .where({ email, type: 'doctor', status: 'pending' })
      .first()

    if (existingInvite) {
      throw new ConflictException('Já existe um convite pendente para este email')
    }

    // 3. Buscar nome do membro que está convidando
    const inviter = await this.knex<AgencyMemberRow>('agency_members')
      .where({ id: invitedBy })
      .first()

    const invitedByName = inviter?.name ?? 'Um administrador'

    // 4. Gerar token
    const token = crypto.randomBytes(32).toString('hex')

    // 5. Calcular expires_at: agora + 7 dias
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // 6. Inserir invite
    await this.knex<InviteRow>('invites').insert({
      type: 'doctor',
      email,
      invited_by: invitedBy,
      token,
      status: 'pending',
      expires_at: expiresAt,
    })

    // 7. Enviar email
    await this.emailService.sendInviteDoctor({ to: email, token, invitedByName })

    this.logger.log(`Convite doctor enviado para ${email} por ${invitedBy}`)

    return { message: 'Convite enviado com sucesso' }
  }
}
