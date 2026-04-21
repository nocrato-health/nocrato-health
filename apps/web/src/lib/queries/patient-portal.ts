import { useMutation } from '@tanstack/react-query'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PatientPortalPatient {
  id: string
  name: string
  phone: string
  email: string | null
  date_of_birth: string | null
  portal_active: boolean
  status: string
}

export interface PatientPortalDoctor {
  name: string
  specialty: string | null
  timezone: string
}

export interface PatientPortalTenant {
  name: string
  slug: string
  primary_color: string | null
  logo_url: string | null
  status: string
}

export type AppointmentStatus =
  | 'scheduled'
  | 'waiting'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled'

export interface PatientPortalAppointment {
  id: string
  date_time: string
  status: AppointmentStatus
  duration_minutes: number
  started_at: string | null
  completed_at: string | null
  cancellation_reason: string | null
}

export type DocumentType = 'prescription' | 'certificate' | 'exam' | 'other'

export interface PatientPortalDocument {
  id: string
  type: DocumentType
  file_url: string
  file_name: string
  description: string | null
  created_at: string
}

export interface PatientPortalData {
  patient: PatientPortalPatient
  doctor: PatientPortalDoctor
  tenant: PatientPortalTenant
  appointments: PatientPortalAppointment[]
  documents: PatientPortalDocument[]
}

export interface PatientPortalSession {
  code: string
  data: PatientPortalData
}

// ─── Helpers de sessionStorage ────────────────────────────────────────────────

const SESSION_KEY = 'nocrato-patient-session'

export function savePatientSession(session: PatientPortalSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function isValidPatientPortalSession(value: unknown): value is PatientPortalSession {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v['code'] !== 'string') return false
  const data = v['data']
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (typeof d['patient'] !== 'object' || d['patient'] === null) return false
  if (typeof d['doctor'] !== 'object' || d['doctor'] === null) return false
  if (typeof d['tenant'] !== 'object' || d['tenant'] === null) return false
  if (!Array.isArray(d['appointments'])) return false
  if (!Array.isArray(d['documents'])) return false
  return true
}

export function loadPatientSession(): PatientPortalSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidPatientPortalSession(parsed)) {
      // Sessão corrompida ou de versão antiga — limpar para forçar novo acesso
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearPatientSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

// ─── URL de download de documento ────────────────────────────────────────────

export function buildDocumentDownloadUrl(documentId: string, code: string): string {
  return `${API_BASE}/api/v1/patient/portal/documents/${documentId}?code=${encodeURIComponent(code)}`
}

// ─── Mutation de acesso ───────────────────────────────────────────────────────

export function usePatientDeleteRequest() {
  return useMutation({
    mutationFn: async (code: string): Promise<{ message: string }> => {
      const response = await fetch(`${API_BASE}/api/v1/patient/portal/delete-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: 'Erro ao solicitar exclusão. Tente novamente.',
        }))
        throw Object.assign(
          new Error(errorData.message ?? 'Erro ao solicitar exclusão. Tente novamente.'),
          { status: response.status, data: errorData },
        )
      }

      return response.json() as Promise<{ message: string }>
    },
  })
}

export function usePatientPortalAccess() {
  return useMutation({
    mutationFn: async (code: string): Promise<PatientPortalData> => {
      const response = await fetch(`${API_BASE}/api/v1/patient/portal/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: 'Código inválido ou inativo.',
        }))
        throw Object.assign(
          new Error(errorData.message ?? 'Código inválido ou inativo.'),
          { status: response.status, data: errorData },
        )
      }

      return response.json() as Promise<PatientPortalData>
    },
  })
}
