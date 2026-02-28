import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { DashboardStats, DoctorListItem, Member, PaginatedResponse } from '@/types/api'

export const dashboardQueryOptions = () =>
  queryOptions<DashboardStats>({
    queryKey: ['agency', 'dashboard'],
    queryFn: () => api.get<DashboardStats>('/api/v1/agency/dashboard'),
  })

export const doctorsQueryOptions = (params: { page: number; limit: number; status?: string }) =>
  queryOptions<PaginatedResponse<DoctorListItem>>({
    queryKey: ['agency', 'doctors', params],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) })
      if (params.status) qs.set('status', params.status)
      return api.get<PaginatedResponse<DoctorListItem>>(`/api/v1/agency/doctors?${qs}`)
    },
  })

export const membersQueryOptions = (params: { page: number; limit: number; status?: string }) =>
  queryOptions<PaginatedResponse<Member>>({
    queryKey: ['agency', 'members', params],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) })
      if (params.status) qs.set('status', params.status)
      return api.get<PaginatedResponse<Member>>(`/api/v1/agency/members?${qs}`)
    },
  })

export function useUpdateDoctorStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'inactive' }) =>
      api.patch(`/api/v1/agency/doctors/${id}/status`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agency', 'doctors'] })
    },
  })
}

export function useInviteDoctor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email }: { email: string }) =>
      api.post('/api/v1/agency/doctors/invite', { email }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agency', 'doctors'] })
    },
  })
}

export function useUpdateMemberStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'inactive' }) =>
      api.patch(`/api/v1/agency/members/${id}/status`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agency', 'members'] })
    },
  })
}
