import { z } from 'zod'

export const ListClinicalNotesSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  // z.coerce.number() é obrigatório: HTTP entrega query params como strings
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

export type ListClinicalNotesDto = z.infer<typeof ListClinicalNotesSchema>
