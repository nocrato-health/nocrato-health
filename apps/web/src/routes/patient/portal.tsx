import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LogOut, Download, FileText, Calendar, User, Stethoscope, Trash2, AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

import {
  loadPatientSession,
  clearPatientSession,
  buildDocumentDownloadUrl,
  usePatientDeleteRequest,
} from '@/lib/queries/patient-portal'
import type {
  PatientPortalSession,
  AppointmentStatus,
  DocumentType,
} from '@/lib/queries/patient-portal'
import { Button } from '@/components/ui/button'

// ─── Constante: URL da política de privacidade ────────────────────────────────

const PRIVACY_POLICY_URL = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/v1/politica-de-privacidade`

// ─── Helpers de formatação ────────────────────────────────────────────────────

function formatDateTime(isoString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(isoString))
}

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
  }).format(new Date(isoString))
}

function formatDateShort(isoString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(isoString))
}

// ─── Mapa de status de consulta ───────────────────────────────────────────────

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Agendada',
  waiting: 'Em espera',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
  rescheduled: 'Reagendada',
}

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-steel/10 text-blue-steel border border-blue-steel/30',
  waiting: 'bg-amber-bright/10 text-amber-mid border border-amber-bright/30',
  in_progress: 'bg-orange/10 text-orange border border-orange/30',
  completed: 'bg-amber-dark/10 text-amber-dark border border-amber-dark/30',
  cancelled: 'bg-gray-100 text-gray-500 border border-gray-200',
  no_show: 'bg-orange/10 text-orange border border-orange/30',
  rescheduled: 'bg-amber-mid/10 text-amber-mid border border-amber-mid/30',
}

// ─── Mapa de tipos de documento ───────────────────────────────────────────────

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  prescription: 'Receita',
  certificate: 'Atestado',
  exam: 'Exame',
  other: 'Outro',
}

// ─── Badge de status ──────────────────────────────────────────────────────────

function StatusBadge({ status }: Readonly<{ status: AppointmentStatus }>) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-[#e8dfc8] text-amber-mid'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Skeleton de carregamento ─────────────────────────────────────────────────

function PortalSkeleton() {
  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-[#e8dfc8] bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <section>
          <Skeleton className="h-4 w-24 mb-3" />
          <div className="bg-white rounded-xl border border-[#e8dfc8] divide-y divide-[#e8dfc8]">
            {['r1', 'r2', 'r3', 'r4'].map((k) => (
              <div key={k} className="flex items-center justify-between px-4 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <Skeleton className="h-4 w-20 mb-3" />
          <div className="space-y-3">
            {['c1', 'c2'].map((k) => (
              <div key={k} className="bg-white rounded-xl border border-[#e8dfc8] p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PatientPortalPage() {
  const navigate = useNavigate()
  const [session, setSession] = React.useState<PatientPortalSession | null>(null)
  const [ready, setReady] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [deleteStatus, setDeleteStatus] = React.useState<'idle' | 'success' | 'error'>('idle')
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const deleteRequest = usePatientDeleteRequest()

  // Ao montar: ler sessão do sessionStorage
  React.useEffect(() => {
    const stored = loadPatientSession()
    if (!stored) {
      navigate({ to: '/patient/access', replace: true }).catch(() => undefined)
      return
    }
    setSession(stored)
    setReady(true)
  }, [navigate])

  function handleLogout() {
    clearPatientSession()
    navigate({ to: '/patient/access', replace: true }).catch(() => undefined)
  }

  function handleDownload(documentId: string) {
    if (!session) return
    const url = buildDocumentDownloadUrl(documentId, session.code)
    window.open(url, '_blank')
  }

  React.useEffect(() => {
    if (session) {
      document.title = `Nocrato — Portal de ${session.data.patient.name}`
    } else {
      document.title = 'Nocrato — Portal do Paciente'
    }
  }, [session])

  // Aguarda verificação do sessionStorage antes de renderizar
  if (!ready || !session) return <PortalSkeleton />

  const { patient, doctor, tenant, appointments, documents } = session.data

  // Ordena consultas: mais recentes primeiro
  const sortedAppointments = [...appointments].sort(
    (a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime(),
  )

  // Cor primária do tenant (com fallback para amber-bright do design system)
  const primaryColor = tenant.primary_color ?? '#fabe01'

  return (
    <div className="min-h-screen bg-cream">

      {/* ─── Header da clínica ─────────────────────────────────────────────── */}
      <header className="border-b border-[#e8dfc8] bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="h-9 w-auto object-contain shrink-0"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: primaryColor }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-dark truncate font-heading">
                {tenant.name}
              </p>
              <p className="text-xs text-amber-mid truncate">
                {doctor.name}
                {doctor.specialty ? ` · ${doctor.specialty}` : ''}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="shrink-0 text-amber-mid hover:text-amber-dark gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      {/* ─── Conteúdo principal ───────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ─── Card: Seus Dados ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-blue-steel" />
            <h2 className="text-sm font-semibold text-amber-dark uppercase tracking-wide font-heading">
              Seus Dados
            </h2>
          </div>

          <div className="bg-white rounded-xl border border-[#e8dfc8] divide-y divide-[#e8dfc8]">
            <DataRow label="Nome" value={patient.name} />
            <DataRow label="Telefone" value={patient.phone} />
            <DataRow label="E-mail" value={patient.email ?? '—'} />
            <DataRow
              label="Data de nascimento"
              value={patient.date_of_birth ? formatDate(patient.date_of_birth) : '—'}
            />
          </div>
        </section>

        {/* ─── Seção: Consultas ────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-blue-steel" />
            <h2 className="text-sm font-semibold text-amber-dark uppercase tracking-wide font-heading">
              Consultas
            </h2>
          </div>

          {sortedAppointments.length === 0 ? (
            <EmptyState
              icon={<Calendar className="w-8 h-8 text-amber-bright opacity-60" />}
              message="Nenhuma consulta encontrada"
            />
          ) : (
            <div className="space-y-3">
              {sortedAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="bg-white rounded-xl border border-[#e8dfc8] p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-dark">
                        {formatDateTime(appointment.date_time)}
                      </p>
                      <p className="text-xs text-amber-mid mt-0.5">
                        Duração: {appointment.duration_minutes} min
                      </p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </div>

                  {appointment.status === 'cancelled' && appointment.cancellation_reason && (
                    <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                      <p className="text-xs text-red-600 leading-relaxed">
                        <span className="font-medium">Motivo: </span>
                        {appointment.cancellation_reason}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ─── Seção: Documentos ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-blue-steel" />
            <h2 className="text-sm font-semibold text-amber-dark uppercase tracking-wide font-heading">
              Documentos
            </h2>
          </div>

          {documents.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-8 h-8 text-amber-bright opacity-60" />}
              message="Nenhum documento disponível"
            />
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white rounded-xl border border-[#e8dfc8] p-4 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-blue-steel/10 px-2 py-0.5 text-xs font-medium text-blue-steel">
                        {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                      </span>
                      <span className="text-xs text-amber-mid">
                        {formatDateShort(doc.created_at)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-amber-dark truncate">
                      {doc.file_name}
                    </p>
                    {doc.description && (
                      <p className="text-xs text-amber-mid leading-relaxed">
                        {doc.description}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(doc.id)}
                    className="shrink-0 gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ─── Seção: Privacidade e exclusão de dados ──────────────────────── */}
        <section>
          <div className="bg-white rounded-xl border border-[#e8dfc8] p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-amber-dark uppercase tracking-wide font-heading">
                Seus Direitos (LGPD)
              </h2>
              <p className="text-xs text-amber-mid mt-1 leading-relaxed">
                Você pode solicitar a exclusão dos seus dados a qualquer momento. Consulte nossa{' '}
                <a
                  href={PRIVACY_POLICY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-steel underline underline-offset-2 hover:text-amber-dark transition-colors"
                >
                  Política de Privacidade
                </a>{' '}
                para saber mais sobre o tratamento dos seus dados.
              </p>
            </div>

            {deleteStatus === 'success' ? (
              <div className="rounded-lg border border-amber-bright/40 bg-amber-bright/10 p-3 text-sm text-amber-dark">
                Sua solicitação de exclusão foi registrada. Entraremos em contato em breve.
              </div>
            ) : (
              <>
                {deleteStatus === 'error' && deleteError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{deleteError}</span>
                  </div>
                )}

                {!showDeleteConfirm ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                    Solicitar exclusão dos meus dados
                  </Button>
                ) : (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                    <p className="text-sm text-red-700 font-medium">
                      Tem certeza que deseja solicitar a exclusão dos seus dados?
                    </p>
                    <p className="text-xs text-red-600 leading-relaxed">
                      Esta ação não pode ser desfeita. Todos os seus dados serão removidos do sistema após a confirmação pela clínica.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          setDeleteError(null)
                          try {
                            await deleteRequest.mutateAsync(session.code)
                            setShowDeleteConfirm(false)
                            setDeleteStatus('success')
                          } catch (err: unknown) {
                            const error = err as Error & { data?: { message?: string } }
                            setDeleteError(
                              error.data?.message ?? error.message ?? 'Erro ao solicitar exclusão. Tente novamente.',
                            )
                            setDeleteStatus('error')
                          }
                        }}
                        loading={deleteRequest.isPending}
                        className="bg-red-600 hover:bg-red-700 text-white border-0"
                      >
                        Sim, solicitar exclusão
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowDeleteConfirm(false)
                          setDeleteStatus('idle')
                          setDeleteError(null)
                        }}
                        disabled={deleteRequest.isPending}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ─── Rodapé ──────────────────────────────────────────────────────── */}
        <footer className="text-center pt-2 pb-4">
          <div className="flex items-center justify-center gap-1.5 text-xs text-amber-mid">
            <Stethoscope className="w-3.5 h-3.5" />
            <span>
              {tenant.name} · {doctor.name}
            </span>
          </div>
          <p className="text-xs text-amber-mid/60 mt-1">
            Informações para uso exclusivo do paciente
          </p>
        </footer>
      </main>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function DataRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-xs text-amber-mid font-medium shrink-0">{label}</span>
      <span className="text-sm text-amber-dark text-right">{value}</span>
    </div>
  )
}

function EmptyState({
  icon,
  message,
}: Readonly<{
  icon: React.ReactNode
  message: string
}>) {
  return (
    <div className="bg-white rounded-xl border border-[#e8dfc8] p-8 text-center space-y-2">
      <div className="flex justify-center">{icon}</div>
      <p className="text-sm text-amber-mid">{message}</p>
    </div>
  )
}
