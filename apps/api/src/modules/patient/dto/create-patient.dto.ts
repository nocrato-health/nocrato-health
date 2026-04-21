import { z } from 'zod'

export const createPatientSchema = z
  .object({
    name: z.string().min(1, 'Nome é obrigatório'),
    phone: z.string().min(1, 'Telefone é obrigatório'),
    document: z.string().optional(),
    documentType: z.enum(['cpf', 'rg']).optional(),
    email: z.string().email('Email inválido').optional(),
    dateOfBirth: z.string().date('Data de nascimento inválida — use o formato ISO 8601').optional(),
  })
  .refine(
    (data) => {
      const hasDoc = data.document !== undefined
      const hasType = data.documentType !== undefined
      return hasDoc === hasType
    },
    {
      message: 'document e documentType devem ser informados juntos ou ambos omitidos',
      path: ['document'],
    },
  )

export type CreatePatientDto = z.infer<typeof createPatientSchema>
