import { z } from 'zod'

export const UpdatePatientSchema = z
  .object({
    name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(150).optional(),
    phone: z.string().max(20).optional(),
    document: z.string().optional(),
    documentType: z.enum(['cpf', 'rg']).optional(),
    email: z.string().email('Email inválido').max(150).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'Pelo menos um campo deve ser informado para atualização' },
  )
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

export type UpdatePatientDto = z.infer<typeof UpdatePatientSchema>
