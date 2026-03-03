import { z } from 'zod'

export const DocumentTypeEnum = ['prescription', 'certificate', 'exam', 'other'] as const

export const CreateDocumentSchema = z.object({
  patientId: z.string().uuid('patientId deve ser um UUID válido'),
  appointmentId: z.string().uuid('appointmentId deve ser um UUID válido').optional(),
  type: z.enum(DocumentTypeEnum, {
    errorMap: () => ({ message: 'type deve ser prescription, certificate, exam ou other' }),
  }),
  fileUrl: z.string().min(1, 'fileUrl não pode estar vazio'),
  fileName: z.string().min(1, 'fileName não pode estar vazio'),
  description: z.string().optional(),
})

export type CreateDocumentDto = z.infer<typeof CreateDocumentSchema>
