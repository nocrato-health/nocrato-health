import { z } from 'zod'

export const RegisterConsentSchema = z.object({
  consentType: z.enum(['privacy_policy', 'data_processing']),
  consentVersion: z.string().min(1).max(20).default('1.0'),
  source: z.enum(['booking', 'patient_portal', 'whatsapp_agent']),
})

export type RegisterConsentDto = z.infer<typeof RegisterConsentSchema>
