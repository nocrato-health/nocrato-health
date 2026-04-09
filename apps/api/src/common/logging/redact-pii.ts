/**
 * redact-pii.ts
 *
 * Redação de PII para logs e payloads. Aplica duas camadas:
 *
 *   1. Allowlist de chaves: qualquer objeto com chaves consideradas sensíveis
 *      tem o valor substituído por '[REDACTED]'. Profundidade ilimitada.
 *
 *   2. Regex em strings: detecta email, telefone BR, CPF, JWT e tokens hex
 *      em strings livres (mensagens de log, error.message) e mascara.
 *
 * Conformidade LGPD (SEC-11). Centraliza a lógica para evitar drift entre
 * call sites e permite testar redação isoladamente.
 *
 * Uso:
 *   logger.error('Falha no envio', redactPii({ email, error }))
 *   logger.warn(redactPii(`Login attempt for ${email}`))
 */

const REDACTED = '[REDACTED]'

/**
 * Chaves cujos valores são SEMPRE substituídos por '[REDACTED]', em qualquer
 * profundidade do objeto. Match case-insensitive e independente de snake/camel.
 */
const SENSITIVE_KEYS = new Set(
  [
    // Identificadores de pessoa
    'email',
    'phone',
    'phone_number',
    'phonenumber',
    'cpf',
    'rg',
    'document',
    // 'name' sozinho é genérico demais — capturaria os.name, server_name,
    // file.name, event.name etc. Só entram as variantes específicas
    // ligadas a pessoa. Se um service precisar redatar um campo 'name'
    // de paciente/doutor, usar 'patient_name' ou 'doctor_name' como chave.
    'fullname',
    'full_name',
    'patient_name',
    'patientname',
    'doctor_name',
    'doctorname',
    // Acesso ao portal e tokens
    'portal_access_code',
    'portalaccesscode',
    'access_code',
    'accesscode',
    'token',
    'access_token',
    'accesstoken',
    'refresh_token',
    'refreshtoken',
    'jwt',
    'authorization',
    // Senhas
    'password',
    'password_hash',
    'passwordhash',
    'new_password',
    'newpassword',
    'old_password',
    'oldpassword',
    // Notas e conteúdo livre médico
    'content',
    'clinical_notes',
    'clinicalnotes',
    'note_content',
    'notecontent',
    'cancellation_reason',
    'cancellationreason',
    // Rede / cliente
    'ip',
    'ip_address',
    'ipaddress',
    'user_agent',
    'useragent',
  ].map((k) => k.toLowerCase()),
)

// ─── Regex de mascaramento em strings livres ──────────────────────────────────

const EMAIL_RE = /([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g
// Telefone BR — duas variantes complementares:
//
//   1) PHONE_FORMATTED_RE: número com algum tipo de separador (parênteses,
//      espaço, hífen) — aceita "(11) 99876-5432", "+55 11 99876-5432",
//      "11 99876-5432". O separador exigido depois do DDD evita falsos
//      positivos em UUIDs (que têm hífen, mas não depois de exatamente 2 dígitos
//      do início de um grupo).
//
//   2) PHONE_PURE_RE: 10 a 13 dígitos consecutivos, isolados de chars
//      alfanuméricos (lookbehind/lookahead). Pega "11998765432" puro,
//      "5511998765432" com prefixo, e também CPF cru de 11 dígitos
//      (deliberado: ambos são PII e merecem mesma redação). UUIDs nunca
//      têm 10+ dígitos consecutivos sem letras hex no meio.
const PHONE_FORMATTED_RE =
  /(?<![a-zA-Z0-9])(?:\+?55\s?)?\(?\d{2}\)?[\s-]\d{4,5}[-.\s]?\d{4}(?![a-zA-Z0-9])/g
const PHONE_PURE_RE = /(?<![a-zA-Z0-9])\d{10,13}(?![a-zA-Z0-9])/g
const JWT_RE = /\beyJ[a-zA-Z0-9_=-]+\.[a-zA-Z0-9_=-]+\.[a-zA-Z0-9_=-]+\b/g
const HEX64_RE = /\b[a-f0-9]{64}\b/g

function maskEmail(match: string): string {
  const [user, domain] = match.split('@')
  if (!domain) return REDACTED
  return `${user[0]}***@***`
}

function maskPhone(match: string): string {
  const digits = match.replace(/\D/g, '')
  if (digits.length < 4) return REDACTED
  return `****${digits.slice(-4)}`
}

/**
 * Aplica regex de PII em uma string livre. Não toca em strings curtas
 * (<5 chars) por performance e pra evitar mascarar coisas como ID truncado.
 */
export function redactPiiInString(input: string): string {
  if (!input || input.length < 5) return input
  // Ordem importa: phones (formatted + pure) antes de CPF formatado, porque
  // "11 dígitos puros" são ambíguos (podem ser CPF ou celular) e queremos
  // mascarar como phone (****XXXX preserva debug). CPF formatado com pontos
  // tem padrão único e roda por último.
  return input
    .replace(JWT_RE, '<jwt:redacted>')
    .replace(HEX64_RE, '<token:redacted>')
    .replace(EMAIL_RE, maskEmail)
    .replace(PHONE_FORMATTED_RE, maskPhone)
    .replace(PHONE_PURE_RE, maskPhone)
    .replace(CPF_RE, '***.***.***-**')
}

/**
 * Redação recursiva de qualquer valor (objeto, array, string, primitivo).
 * - Objetos: chaves em SENSITIVE_KEYS → REDACTED, demais valores recursivos.
 * - Arrays: cada item recursivo.
 * - Strings: aplica regex de PII.
 * - Primitivos restantes (number, boolean, null, undefined): mantidos.
 * - Errors: extrai message e stack, redatando ambos.
 *
 * Não muta o valor original.
 */
export function redactPii<T>(value: T): T {
  return redactRecursive(value, new WeakSet()) as T
}

function redactRecursive(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactPiiInString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactPiiInString(value.message),
      stack: value.stack ? redactPiiInString(value.stack) : undefined,
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactRecursive(item, seen))
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]'
    seen.add(value as object)
    const result: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = REDACTED
      } else {
        result[key] = redactRecursive(v, seen)
      }
    }
    return result
  }

  return value
}
