import { z } from 'zod'

export const ListPatientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

export type ListPatientsQueryDto = z.infer<typeof ListPatientsQuerySchema>
