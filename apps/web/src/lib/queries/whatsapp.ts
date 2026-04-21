import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type WhatsAppConnectionStatus = 'open' | 'close' | 'connecting' | 'not_configured'
export type WhatsAppQrStatus = 'qr_ready' | 'connected' | 'connecting'

export interface WhatsAppStatusResponse {
  instanceName: string
  status: WhatsAppConnectionStatus
  phoneNumber?: string
}

export interface WhatsAppConnectResponse {
  instanceName: string
  qrCode: string
  status: WhatsAppConnectionStatus
}

export interface WhatsAppQrResponse {
  qrCode: string
  status: WhatsAppQrStatus
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const whatsappKeys = {
  status: ['doctor', 'whatsapp', 'status'] as const,
  qr: ['doctor', 'whatsapp', 'qr'] as const,
}

// ─── Status — polling a cada 5s quando connecting ────────────────────────────
// O caller é responsável por passar pollingActive baseado no status atual.

export const whatsappStatusQueryOptions = (pollingActive: boolean) =>
  queryOptions<WhatsAppStatusResponse>({
    queryKey: whatsappKeys.status,
    queryFn: () => api.get<WhatsAppStatusResponse>('/api/v1/doctor/whatsapp/status'),
    refetchInterval: pollingActive ? 5000 : false,
  })

export function useWhatsAppStatus(pollingActive: boolean) {
  return useQuery(whatsappStatusQueryOptions(pollingActive))
}

// ─── QR code — polling a cada 3s quando status é qr_ready ────────────────────

export const whatsappQrQueryOptions = (enabled: boolean) =>
  queryOptions<WhatsAppQrResponse>({
    queryKey: whatsappKeys.qr,
    queryFn: () => api.get<WhatsAppQrResponse>('/api/v1/doctor/whatsapp/qr'),
    enabled,
    refetchInterval: enabled ? 3000 : false,
  })

export function useWhatsAppQr(enabled: boolean) {
  return useQuery(whatsappQrQueryOptions(enabled))
}

// ─── Connect — POST /connect ──────────────────────────────────────────────────

export function useWhatsAppConnect() {
  const queryClient = useQueryClient()
  return useMutation<WhatsAppConnectResponse, Error, void>({
    mutationFn: () => api.post<WhatsAppConnectResponse>('/api/v1/doctor/whatsapp/connect'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: whatsappKeys.status })
    },
  })
}

// ─── Disconnect — DELETE /disconnect ─────────────────────────────────────────

export function useWhatsAppDisconnect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete('/api/v1/doctor/whatsapp/disconnect'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: whatsappKeys.status })
      void queryClient.removeQueries({ queryKey: whatsappKeys.qr })
    },
  })
}
