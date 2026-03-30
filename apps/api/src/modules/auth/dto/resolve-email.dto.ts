import { z } from 'zod'

export const ResolveEmailSchema = z.object({
  email: z.string().email(),
})

export type ResolveEmailDto = z.infer<typeof ResolveEmailSchema>
