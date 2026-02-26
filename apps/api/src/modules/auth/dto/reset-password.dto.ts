import { z } from 'zod'

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>
