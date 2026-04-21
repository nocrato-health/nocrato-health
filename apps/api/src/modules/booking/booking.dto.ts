import { z } from 'zod'

// ---------------------------------------------------------------------------
// US-7.2 — Validate Token
// ---------------------------------------------------------------------------

export const ValidateTokenQuerySchema = z.object({
  token: z.string().min(1),
  date: z.string().min(1).optional(),
})

export type ValidateTokenQueryDto = z.infer<typeof ValidateTokenQuerySchema>

// ---------------------------------------------------------------------------
// US-7.3 — Book Appointment (POST /public/booking/:slug/book)
// ---------------------------------------------------------------------------

export const BookAppointmentSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(100),
  phone: z.string().min(10).max(20),
  dateTime: z.string().datetime({ offset: true }), // ISO 8601 com timezone (ex: "2026-03-10T14:00:00-03:00")
  consentAccepted: z.boolean().refine((v) => v === true, {
    message: 'Consentimento com a política de privacidade é obrigatório',
  }),
})

export type BookAppointmentDto = z.infer<typeof BookAppointmentSchema>

// ---------------------------------------------------------------------------
// US-7.4 — Book In-Chat (chamada interna do agent)
// ---------------------------------------------------------------------------

export const BookInChatSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  dateTime: z.string().datetime({ offset: true }),
})

export type BookInChatDto = z.infer<typeof BookInChatSchema>
