import { Injectable, Logger } from '@nestjs/common'
import { Resend } from 'resend'
import { env } from '@/config/env'
import { inviteMemberTemplate } from './templates/invite-member'
import { inviteDoctorTemplate } from './templates/invite-doctor'
import { passwordResetTemplate } from './templates/password-reset'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private readonly resend = new Resend(env.RESEND_API_KEY)

  async sendInviteMember(params: {
    to: string
    token: string
    invitedByName: string
  }): Promise<void> {
    const inviteUrl = `${env.FRONTEND_URL}/agency/invite?token=${params.token}`

    const { error } = await this.resend.emails.send({
      from: env.EMAIL_FROM,
      to: params.to,
      subject: 'Convite para acessar o Nocrato Health',
      html: inviteMemberTemplate({
        inviteUrl,
        invitedByName: params.invitedByName,
      }),
    })

    if (error) {
      this.logger.error(`Falha ao enviar e-mail de convite para ${params.to}: ${error.message}`)
      throw new Error(`Falha ao enviar e-mail de convite: ${error.message}`)
    }

    this.logger.log(`E-mail de convite enviado para ${params.to}`)
  }

  async sendInviteDoctor(params: {
    to: string
    token: string
    invitedByName: string
  }): Promise<void> {
    const inviteUrl = `${env.FRONTEND_URL}/doctor/invite?token=${params.token}`

    const { error } = await this.resend.emails.send({
      from: env.EMAIL_FROM,
      to: params.to,
      subject: 'Convite para criar seu portal médico — Nocrato Health',
      html: inviteDoctorTemplate({
        inviteUrl,
        invitedByName: params.invitedByName,
      }),
    })

    if (error) {
      this.logger.error(`Falha ao enviar e-mail de convite para doutor ${params.to}: ${error.message}`)
      throw new Error(`Falha ao enviar e-mail de convite: ${error.message}`)
    }

    this.logger.log(`E-mail de convite para doutor enviado para ${params.to}`)
  }

  async sendPasswordReset(params: {
    to: string
    token: string
    userType: 'agency' | 'doctor'
  }): Promise<void> {
    const route = params.userType === 'agency' ? 'agency/reset-password' : 'doctor/reset-password'
    const resetUrl = `${env.FRONTEND_URL}/${route}?token=${params.token}`

    const { error } = await this.resend.emails.send({
      from: env.EMAIL_FROM,
      to: params.to,
      subject: 'Redefinição de senha — Nocrato Health',
      html: passwordResetTemplate({ resetUrl, userType: params.userType }),
    })

    if (error) {
      this.logger.error(`Falha ao enviar e-mail de reset para ${params.to}: ${error.message}`)
      throw new Error(`Falha ao enviar e-mail de reset: ${error.message}`)
    }

    this.logger.log(`E-mail de redefinição de senha enviado para ${params.to}`)
  }
}
