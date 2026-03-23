import { z } from 'zod'

// Máquina de estados das consultas (US-5.3)
// Cada variante do discriminatedUnion define os campos obrigatórios/opcionais por transição
export const UpdateAppointmentStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('waiting') }),
  z.object({ status: z.literal('in_progress') }),
  z.object({
    status: z.literal('completed'),
    notes: z.string().min(1, 'Notas são obrigatórias ao finalizar a consulta'),
  }),
  z.object({ status: z.literal('no_show') }),
  z.object({
    status: z.literal('cancelled'),
    cancellationReason: z.string().min(1, 'Motivo de cancelamento é obrigatório'),
  }),
  z.object({
    status: z.literal('rescheduled'),
    newDateTime: z.string().datetime('newDateTime deve ser uma string ISO 8601 válida'),
    cancellationReason: z.string().optional(),
  }),
])

export type UpdateAppointmentStatusDto = z.infer<typeof UpdateAppointmentStatusSchema>
