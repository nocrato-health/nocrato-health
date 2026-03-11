import { z } from 'zod'

export const GetPortalAccessSchema = z.object({
  // Formato gerado pelo sistema: AAA-1234-BBB (3 letras sem I/O, 4 dígitos, 3 letras sem I/O)
  // I e O excluídos para evitar confusão visual com 1 e 0 ao digitar manualmente
  code: z.string().regex(/^[A-HJ-NP-Z]{3}-\d{4}-[A-HJ-NP-Z]{3}$/, 'Formato de código inválido'),
})

export type GetPortalAccessDto = z.infer<typeof GetPortalAccessSchema>
