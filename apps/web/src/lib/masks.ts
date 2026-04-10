// ─── Helpers de máscara e formatação de documentos ────────────────────────────

/**
 * Formata uma string de dígitos como CPF: 123.456.789-00
 * Aceita strings com ou sem pontuação — normaliza antes de formatar.
 */
export function maskCpf(value: string): string {
  const digits = value.replaceAll(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

/**
 * Remove toda pontuação de um documento — retorna apenas dígitos.
 * Usar no onSubmit do form antes de enviar pro backend.
 */
export function unmaskDocument(value: string): string {
  return value.replaceAll(/\D/g, '')
}
