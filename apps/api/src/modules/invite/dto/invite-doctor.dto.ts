import { z } from 'zod'

export const InviteDoctorSchema = z.object({
  email: z.string().email('Email inválido'),
})

export type InviteDoctorDto = z.infer<typeof InviteDoctorSchema>
