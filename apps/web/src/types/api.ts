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
