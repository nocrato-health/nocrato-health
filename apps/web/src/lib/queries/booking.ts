import { queryOptions, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// ─── Tipos de resposta ────────────────────────────────────────────────────────

export interface ValidateTokenResponse {
  valid: boolean
  reason?: 'expired' | 'used' | 'not_found'
  doctor?: {
    name: string
    specialty?: string
  }
  tenant?: {
    name: string
    primaryColor?: string
    logoUrl?: string
  }
  phone?: string
}

export interface Slot {
  start: string
  end: string
}

export interface SlotsResponse {
  date: string
  slots: Slot[]
  timezone: string
  durationMinutes: number
}

export interface BookResponse {
  appointment: {
    id: string
    dateTime: string
  }
  patient: {
    id: string
    name: string
  }
  doctor: {
    name: string
  }
  message: string
}

// ─── Payloads de mutação ──────────────────────────────────────────────────────

export interface BookAppointmentPayload {
  slug: string
  token: string
  name: string
  phone: string
  dateTime: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const validateTokenQueryOptions = (slug: string, token: string) =>
  queryOptions<ValidateTokenResponse>({
    queryKey: ['booking', 'validate', slug, token],
    queryFn: () =>
      api.get<ValidateTokenResponse>(
        `/api/v1/public/booking/${slug}/validate?token=${encodeURIComponent(token)}`,
      ),
    enabled: !!slug && !!token,
    retry: false,
    staleTime: Infinity,
  })

export const availableSlotsQueryOptions = (slug: string, token: string, date: string) =>
  queryOptions<SlotsResponse>({
    queryKey: ['booking', 'slots', slug, token, date],
    queryFn: () =>
      api.get<SlotsResponse>(
        `/api/v1/public/booking/${slug}/slots?token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}`,
      ),
    enabled: !!slug && !!token && !!date,
    retry: false,
  })

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useBookAppointment() {
  return useMutation({
    mutationFn: ({ slug, token, name, phone, dateTime }: BookAppointmentPayload) =>
      api.post<BookResponse>(`/api/v1/public/booking/${slug}/book`, {
        token,
        name,
        phone,
        dateTime,
      }),
  })
}
