import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// ─── Chaves de query ──────────────────────────────────────────────────────────

export const whatsappKeys = {
  status: ['whatsapp', 'status'] as const,
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface WhatsAppCloudConnectResponse {
  phoneNumber: string
  verifiedName: string
  status: 'connected'
}

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
