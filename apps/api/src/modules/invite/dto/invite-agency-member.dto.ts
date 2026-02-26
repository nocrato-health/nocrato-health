import { z } from 'zod'

export const InviteAgencyMemberSchema = z.object({
  email: z.string().email('Email inválido'),
})

export type InviteAgencyMemberDto = z.infer<typeof InviteAgencyMemberSchema>
