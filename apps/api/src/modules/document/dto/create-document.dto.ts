import { z } from 'zod'

export const DocumentTypeEnum = ['prescription', 'certificate', 'exam', 'other'] as const

export const CreateDocumentSchema = z.object({
  patientId: z.string().uuid('patientId deve ser um UUID válido'),
  appointmentId: z.string().uuid('appointmentId deve ser um UUID válido').optional(),
  type: z.enum(DocumentTypeEnum, {
    errorMap: () => ({ message: 'type deve ser prescription, certificate, exam ou other' }),
  }),
  fileUrl: z.string().regex(
    /^\/uploads\/[a-f0-9-]+\/[a-f0-9-]+\.[a-zA-Z0-9]{2,5}$/,
    'fileUrl deve ser um path válido no formato /uploads/{tenantId}/{uuid.ext}',
  ),
  fileName: z.string().min(1, 'fileName não pode estar vazio'),
  description: z.string().optional(),
})

export type CreateDocumentDto = z.infer<typeof CreateDocumentSchema>
