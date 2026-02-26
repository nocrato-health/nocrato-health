import { z } from 'zod'

const RESERVED_SLUGS = ['admin', 'api', 'agent', 'app', 'www', 'mail', 'nocrato', 'health', 'login', 'auth', 'dashboard', 'portal', 'booking']

export const AcceptDoctorInviteSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(255),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  slug: z
    .string()
    .min(3, 'Slug deve ter ao menos 3 caracteres')
    .max(100, 'Slug deve ter no máximo 100 caracteres')
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug deve conter apenas letras minúsculas, números e hífens, e não pode começar ou terminar com hífen')
    .refine((s) => !RESERVED_SLUGS.includes(s), 'Este slug é reservado e não pode ser utilizado'),
})

export type AcceptDoctorInviteDto = z.infer<typeof AcceptDoctorInviteSchema>
