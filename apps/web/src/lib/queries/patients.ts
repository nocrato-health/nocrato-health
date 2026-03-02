import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { PatientListItem, PatientProfile, PaginatedResponse } from '@/types/api'

// ─── Tipos de payload ─────────────────────────────────────────────────────────

export interface PatientsQueryParams {
  page: number
  limit: number
  search?: string
  status?: 'active' | 'inactive'
}

export interface CreatePatientPayload {
  name: string
  phone: string
  cpf?: string
  email?: string
  dateOfBirth?: string
}

export interface UpdatePatientPayload {
  name?: string
  phone?: string
  cpf?: string
  email?: string
  status?: 'active' | 'inactive'
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const patientsQueryOptions = (params: PatientsQueryParams) => {
  const searchParams = new URLSearchParams()
  searchParams.set('page', String(params.page))
  searchParams.set('limit', String(params.limit))
  if (params.search) searchParams.set('search', params.search)
  if (params.status) searchParams.set('status', params.status)

  return queryOptions<PaginatedResponse<PatientListItem>>({
    queryKey: ['doctor', 'patients', params],
    queryFn: () =>
      api.get<PaginatedResponse<PatientListItem>>(
        `/api/v1/doctor/patients?${searchParams.toString()}`,
      ),
  })
}

export const patientProfileQueryOptions = (id: string) =>
  queryOptions<PatientProfile>({
    queryKey: ['doctor', 'patients', id, 'profile'],
    queryFn: () => api.get<PatientProfile>(`/api/v1/doctor/patients/${id}`),
    enabled: !!id,
  })

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreatePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePatientPayload) =>
      api.post<PatientListItem>('/api/v1/doctor/patients', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'patients'] })
    },
  })
}

export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePatientPayload) =>
      api.patch<PatientListItem>(`/api/v1/doctor/patients/${id}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'patients'] })
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'patients', id, 'profile'] })
    },
  })
}
