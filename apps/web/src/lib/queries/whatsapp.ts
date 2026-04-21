import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// ─── Chaves de query ──────────────────────────────────────────────────────────

export const whatsappKeys = {
  status: ['whatsapp', 'status'] as const,
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type WhatsAppConnectionType = 'cloud' | 'evolution' | null

export interface WhatsAppStatusResponse {
  connected: boolean
  connectionType: WhatsAppConnectionType
  // Campos presentes quando connected=true e connectionType='cloud'
  phoneNumber?: string
  verifiedName?: string
  // Campos presentes quando connected=true e connectionType='evolution'
  qrCode?: string
  instanceStatus?: string
}

export interface WhatsAppCloudConnectResponse {
  phoneNumber: string
  verifiedName: string
  status: 'connected'
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const whatsappStatusQueryOptions = () =>
  queryOptions<WhatsAppStatusResponse>({
    queryKey: whatsappKeys.status,
    queryFn: () => api.get<WhatsAppStatusResponse>('/api/v1/doctor/whatsapp/status'),
    refetchInterval: 5000,
  })

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useWhatsAppConnectCloud() {
  const queryClient = useQueryClient()
  return useMutation<WhatsAppCloudConnectResponse, Error, { code: string }>({
    mutationFn: ({ code }) =>
      api.post<WhatsAppCloudConnectResponse>('/api/v1/doctor/whatsapp/connect-cloud', { code }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: whatsappKeys.status })
    },
  })
}

export function useWhatsAppGenerateQR() {
  const queryClient = useQueryClient()
  return useMutation<{ qrCode: string }, Error, void>({
    mutationFn: () => api.post<{ qrCode: string }>('/api/v1/doctor/whatsapp/connect', {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: whatsappKeys.status })
    },
  })
}

export function useWhatsAppDisconnect() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, void>({
    mutationFn: () => api.delete<void>('/api/v1/doctor/whatsapp/disconnect'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: whatsappKeys.status })
    },
  })
}
