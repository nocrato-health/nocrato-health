import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth'
import { api } from '@/lib/api-client'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CreateClinicalNotePayload {
  appointmentId: string
  patientId: string
  content: string
}

export interface ClinicalNote {
  id: string
  appointmentId: string
  patientId: string
  content: string
  createdAt: string
}

export interface UploadFileResponse {
  fileUrl: string
  fileName: string
}

export type DocumentType = 'prescription' | 'certificate' | 'exam' | 'other'

export interface CreateDocumentPayload {
  patientId: string
  appointmentId?: string
  type: DocumentType
  fileUrl: string
  fileName: string
  description?: string
}

export interface Document {
  id: string
  patientId: string
  appointmentId?: string
  type: DocumentType
  fileUrl: string
  fileName: string
  description?: string
  createdAt: string
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateClinicalNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateClinicalNotePayload) =>
      api.post<ClinicalNote>('/api/v1/doctor/clinical-notes', data),
    onSuccess: (_result, variables) => {
      // Invalida o detalhe da consulta (notas aparecem lá)
      void queryClient.invalidateQueries({
        queryKey: ['doctor', 'appointments', variables.appointmentId, 'detail'],
      })
      // Invalida o perfil do paciente (notas aparecem na tab Notas)
      void queryClient.invalidateQueries({
        queryKey: ['doctor', 'patients', variables.patientId, 'profile'],
      })
    },
  })
}

export function useUploadFile() {
  return useMutation({
    mutationFn: async (file: File): Promise<UploadFileResponse> => {
      const { accessToken } = useAuthStore.getState()

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/api/v1/doctor/upload`, {
        method: 'POST',
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Erro ao fazer upload' }))
        throw Object.assign(new Error(errorData.message ?? 'Erro ao fazer upload'), {
          status: response.status,
          data: errorData,
        })
      }

      return response.json() as Promise<UploadFileResponse>
    },
    // Sem invalidação de query — é passo intermediário do fluxo de upload
  })
}

export function useCreateDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateDocumentPayload) =>
      api.post<Document>('/api/v1/doctor/documents', data),
    onSuccess: (_result, variables) => {
      // Invalida o perfil do paciente (documentos aparecem na tab Documentos)
      void queryClient.invalidateQueries({
        queryKey: ['doctor', 'patients', variables.patientId, 'profile'],
      })
    },
  })
}
