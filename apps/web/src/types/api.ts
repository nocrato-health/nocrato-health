// Tipos que espelham as respostas do backend

export type UserType = 'agency' | 'doctor'

export interface AgencyMember {
  id: string
  email: string
  name: string
  role: 'agency_admin' | 'agency_member'
}

export interface Doctor {
  id: string
  email: string
  name: string
  tenantId: string
  slug: string
  onboardingCompleted: boolean
}

export interface Tenant {
  id: string
  slug: string
  displayName: string
}

// Auth responses
export interface AgencyLoginResponse {
  accessToken: string
  refreshToken: string
  member: AgencyMember
}

export interface DoctorLoginResponse {
  accessToken: string
  refreshToken: string
  doctor: Doctor
  tenant: Tenant
}

export interface DoctorInviteValidation {
  email: string
  name: string | null
  hasPendingInvite: boolean
}

export interface DoctorResolveEmailResponse {
  exists: boolean
  slug?: string
  hasPendingInvite?: boolean
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

export interface MessageResponse {
  message: string
}

export interface ApiError {
  statusCode: number
  message: string | string[]
  error?: string
}

// US-2.5 — Agency portal

export interface DashboardStats {
  totalDoctors: number
  activeDoctors: number
  totalPatients: number
  totalAppointments: number
  upcomingAppointments: number
}

export interface DoctorListItem {
  id: number
  name: string
  email: string
  slug: string
  status: 'active' | 'inactive'
  specialty?: string
  createdAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface Member {
  id: number
  name: string
  email: string
  role: 'agency_admin' | 'agency_member'
  status: 'pending' | 'active' | 'inactive'
  createdAt: string
}

// US-3.2 — Doctor onboarding

export interface OnboardingSteps {
  profile: boolean
  schedule: boolean
  branding: boolean
  agent: boolean
}

export interface OnboardingStatus {
  currentStep: number
  completed: boolean
  steps: OnboardingSteps
}

export interface WorkingHoursSlot {
  start: string
  end: string
}

export type WorkingHours = Partial<
  Record<
    'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
    WorkingHoursSlot[]
  >
>

export interface CompleteOnboardingResponse {
  success: boolean
  doctor: {
    id: string
    name: string
    email: string
    tenantId: string
    slug: string
  }
}

// US-4.5 — Patient portal

export interface PatientListItem {
  id: string
  name: string
  phone: string
  email?: string
  source: 'manual' | 'agent'
  status: 'active' | 'inactive'
  created_at: string
}

export interface PatientAppointment {
  id: string
  date_time: string
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled'
  duration_minutes: number
  started_at?: string
  completed_at?: string
}

export interface PatientClinicalNote {
  id: string
  appointment_id?: string
  content: string
  created_at: string
}

export interface PatientDocument {
  id: string
  file_name: string
  type: string
  file_url: string
  mime_type: string
  created_at: string
}

export interface PatientProfile {
  patient: PatientListItem & { portal_active: boolean }
  appointments: PatientAppointment[]
  clinicalNotes: PatientClinicalNote[]
  documents: PatientDocument[]
}

// US-5.6 — Appointment portal

export type AppointmentStatus =
  | 'scheduled'
  | 'waiting'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled'

export interface Appointment {
  id: string
  tenant_id: string
  patient_id: string
  date_time: string
  duration_minutes: number
  status: AppointmentStatus
  cancellation_reason?: string | null
  rescheduled_to_id?: string | null
  created_by: 'doctor' | 'agent'
  started_at?: string | null
  completed_at?: string | null
  created_at: string
}

export interface DoctorDashboardStats {
  todayAppointments: Appointment[]
  totalPatients: number
  pendingFollowUps: number
}

export interface AppointmentDetail {
  appointment: Appointment
  patient: {
    id: string
    name: string
    phone: string
    email: string | null
    source: 'manual' | 'agent'
    status: 'active' | 'inactive'
    portal_active: boolean
    created_at: string
  }
  clinicalNotes: Array<{
    id: string
    content: string
    created_at: string
  }>
}
