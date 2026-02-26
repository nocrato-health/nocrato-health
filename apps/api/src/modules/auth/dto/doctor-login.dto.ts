import { z } from 'zod'

export const DoctorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export type DoctorLoginDto = z.infer<typeof DoctorLoginSchema>
