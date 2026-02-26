import { z } from 'zod'

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>
