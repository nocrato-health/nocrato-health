import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(isoString))
}

export function formatDateTime(isoString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString))
}

export function formatPhone(value: string): string {
  const digits = value.replaceAll(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * Converte ISO UTC para formato aceito pelo input datetime-local (YYYY-MM-DDTHH:MM).
 * Quando `timezone` é fornecido, a conversão usa o fuso do médico via Intl.
 * Sem `timezone`: fallback para o fuso do browser (comportamento MVP anterior).
 */
export function toDatetimeLocal(isoUtc: string, timezone?: string): string {
  if (timezone) {
    const d = new Date(isoUtc)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = formatter.formatToParts(d)
    const get = (type: string) => parts.find((p) => p.type === type)!.value
    // en-CA produz YYYY-MM-DD; hour/minute são 2-digit
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
  }
  // Fallback: fuso do browser
  const d = new Date(isoUtc)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Converte valor do input datetime-local para ISO UTC.
 * Quando `timezone` é fornecido, interpreta `localStr` como horário naquele fuso.
 * Sem `timezone`: fallback para o fuso do browser (comportamento MVP anterior).
 */
export function fromDatetimeLocal(localStr: string, timezone?: string): string {
  if (timezone) {
    // localStr é "YYYY-MM-DDTHH:MM" no fuso do médico.
    // Trata como UTC provisoriamente para calcular o offset real via Intl.
    const ref = new Date(`${localStr}:00Z`)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts = formatter.formatToParts(ref)
    const get = (type: string) => parts.find((p) => p.type === type)!.value
    const localAtRef = new Date(
      `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`,
    )
    const offsetMs = ref.getTime() - localAtRef.getTime()
    return new Date(ref.getTime() + offsetMs).toISOString()
  }
  return new Date(localStr).toISOString()
}
