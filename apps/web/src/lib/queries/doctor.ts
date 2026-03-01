import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type {
  OnboardingStatus,
  WorkingHours,
  CompleteOnboardingResponse,
} from '@/types/api'

// ─── Queries ─────────────────────────────────────────────────────────────────

export const onboardingStatusQueryOptions = () =>
  queryOptions<OnboardingStatus>({
    queryKey: ['doctor', 'onboarding', 'status'],
    queryFn: () => api.get<OnboardingStatus>('/api/v1/doctor/onboarding/status'),
  })

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface UpdateProfilePayload {
  name: string
  crm: string
  crmState: string
  specialty?: string
  phone?: string
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateProfilePayload) =>
      api.patch('/api/v1/doctor/onboarding/profile', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'onboarding', 'status'] })
    },
  })
}

export interface UpdateSchedulePayload {
  workingHours: WorkingHours
  timezone: string
  appointmentDuration: number
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateSchedulePayload) =>
      api.patch('/api/v1/doctor/onboarding/schedule', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'onboarding', 'status'] })
    },
  })
}

export interface UpdateBrandingPayload {
  primaryColor?: string
  logoUrl?: string
}

export function useUpdateBranding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateBrandingPayload) =>
      api.patch('/api/v1/doctor/onboarding/branding', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'onboarding', 'status'] })
    },
  })
}

export interface UpdateAgentPayload {
  welcomeMessage: string
  personality?: string
}

export function useUpdateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateAgentPayload) =>
      api.patch('/api/v1/doctor/onboarding/agent', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'onboarding', 'status'] })
    },
  })
}

export function useCompleteOnboarding() {
  return useMutation({
    mutationFn: () => api.post<CompleteOnboardingResponse>('/api/v1/doctor/onboarding/complete'),
  })
}
