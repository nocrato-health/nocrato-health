import { z } from 'zod'

export const AcceptInviteSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(255),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
})

export type AcceptInviteDto = z.infer<typeof AcceptInviteSchema>
