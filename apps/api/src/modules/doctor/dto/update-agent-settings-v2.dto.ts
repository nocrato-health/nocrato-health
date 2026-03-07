import { z } from 'zod'

// DTO para US-8.1 — PATCH /api/v1/doctor/agent-settings
// Distinto do update-agent-settings.dto.ts (usado no onboarding, step 4).
// Este DTO suporta patch parcial real com enabled e bookingMode.

export const UpdateAgentSettingsV2Schema = z.object({
  enabled: z.boolean().optional(),
  bookingMode: z.enum(['link', 'chat', 'both']).optional(),
  welcomeMessage: z.string().max(1000).nullable().optional(),
  personality: z.string().max(2000).nullable().optional(),
  faq: z.string().max(5000).nullable().optional(),
  appointmentRules: z.string().max(3000).nullable().optional(),
})

export type UpdateAgentSettingsV2Dto = z.infer<typeof UpdateAgentSettingsV2Schema>
