import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type {
  Appointment,
  AppointmentDetail,
  AppointmentStatus,
  DoctorDashboardStats,
  PaginatedResponse,
  PatientListItem,
} from '@/types/api'

// ─── Tipos de payload ─────────────────────────────────────────────────────────

export interface AppointmentsQueryParams {
  page: number
  limit: number
  status?: AppointmentStatus | ''
  date?: string
  patientId?: string
}

export interface CreateAppointmentPayload {
  patientId: string
  dateTime: string
  durationMinutes: number
  notes?: string
}

export type UpdateAppointmentStatusPayload =
  | { status: 'waiting' }
  | { status: 'in_progress' }
  | { status: 'completed'; notes?: string }
  | { status: 'cancelled'; cancellationReason: string }
  | { status: 'no_show' }
  | { status: 'rescheduled'; newDateTime: string; newDurationMinutes?: number }

// ─── Queries ─────────────────────────────────────────────────────────────────

export const dashboardQueryOptions = () =>
  queryOptions<DoctorDashboardStats>({
    queryKey: ['doctor', 'dashboard'],
    queryFn: () => api.get<DoctorDashboardStats>('/api/v1/doctor/appointments/dashboard'),
    staleTime: 30_000,
  })

export const appointmentsQueryOptions = (params: AppointmentsQueryParams) => {
  const searchParams = new URLSearchParams()
  searchParams.set('page', String(params.page))
  searchParams.set('limit', String(params.limit))
  if (params.status) searchParams.set('status', params.status)
  if (params.date) searchParams.set('date', params.date)
  if (params.patientId) searchParams.set('patientId', params.patientId)

  return queryOptions<PaginatedResponse<Appointment>>({
    queryKey: ['doctor', 'appointments', params],
    queryFn: () =>
      api.get<PaginatedResponse<Appointment>>(
        `/api/v1/doctor/appointments?${searchParams.toString()}`,
      ),
  })
}

export const appointmentDetailQueryOptions = (id: string) =>
  queryOptions<AppointmentDetail>({
    queryKey: ['doctor', 'appointments', id, 'detail'],
    queryFn: () => api.get<AppointmentDetail>(`/api/v1/doctor/appointments/${id}`),
    enabled: !!id,
  })

export const patientsSearchQueryOptions = (search: string) =>
  queryOptions<PaginatedResponse<PatientListItem>>({
    queryKey: ['doctor', 'patients', 'search', search],
    queryFn: () => {
      const sp = new URLSearchParams({ page: '1', limit: '20' })
      if (search.trim()) sp.set('search', search.trim())
      return api.get<PaginatedResponse<PatientListItem>>(
        `/api/v1/doctor/patients?${sp.toString()}`,
      )
    },
    staleTime: 10_000,
  })

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAppointmentPayload) =>
      api.post<Appointment>('/api/v1/doctor/appointments', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'appointments'] })
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'dashboard'] })
    },
  })
}

export function useUpdateAppointmentStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateAppointmentStatusPayload) =>
      api.patch<Appointment>(`/api/v1/doctor/appointments/${id}/status`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'appointments'] })
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'appointments', id, 'detail'] })
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'dashboard'] })
    },
  })
}
