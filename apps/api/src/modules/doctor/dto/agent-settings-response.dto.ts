import { z } from 'zod'

export const AgentSettingsResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  enabled: z.boolean(),
  bookingMode: z.enum(['link', 'chat', 'both']),
  welcomeMessage: z.string().nullable(),
  personality: z.string().nullable(),
  faq: z.string().nullable(),
  appointmentRules: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
})

export type AgentSettingsResponseDto = z.infer<typeof AgentSettingsResponseSchema>
