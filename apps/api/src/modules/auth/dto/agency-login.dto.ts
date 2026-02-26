import { z } from 'zod'

export const AgencyLoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

export type AgencyLoginDto = z.infer<typeof AgencyLoginSchema>
