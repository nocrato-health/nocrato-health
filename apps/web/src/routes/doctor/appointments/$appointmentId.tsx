import * as React from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Calendar, User, FileText, Clock, Plus } from 'lucide-react'

import { appointmentDetailQueryOptions, useUpdateAppointmentStatus } from '@/lib/queries/appointments'
import { formatDate, formatDateTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CreateClinicalNoteDialog } from '@/components/doctor/CreateClinicalNoteDialog'
import type { AppointmentStatus } from '@/types/api'

// ─── Helpers de status ────────────────────────────────────────────────────────

const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: 'Agendada',
  waiting: 'Aguardando',
  in_progress: 'Em atendimento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
  rescheduled: 'Reagendada',
}

const appointmentStatusStyles: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  waiting: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  no_show: 'bg-gray-100 text-gray-500',
  rescheduled: 'bg-purple-100 text-purple-700',
}

// ─── Dialogs de ação ──────────────────────────────────────────────────────────

interface CancelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
  isPending: boolean
}

function CancelDialog({ open, onOpenChange, onConfirm, isPending }: CancelDialogProps) {
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 3) {
      setError('O motivo deve ter pelo menos 3 caracteres.')
      return
    }
    onConfirm(reason.trim())
  }

  function handleClose() {
    setReason('')
    setError('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar consulta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Motivo do cancelamento *</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (error) setError('')
              }}
              placeholder="Informe o motivo do cancelamento..."
              rows={3}
              className="border-[#e8dfc8] focus-visible:ring-amber-dark/30 resize-none"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" loading={isPending}>
              Confirmar cancelamento
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface RescheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (newDateTime: string, newDurationMinutes: number) => void
  isPending: boolean
}

function RescheduleDialog({ open, onOpenChange, onConfirm, isPending }: RescheduleDialogProps) {
  const [newDateTime, setNewDateTime] = React.useState('')
  const [durationMinutes, setDurationMinutes] = React.useState('30')
  const [error, setError] = React.useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newDateTime) {
      setError('Informe a nova data e hora.')
      return
    }
    onConfirm(new Date(newDateTime).toISOString(), Number(durationMinutes))
  }

  function handleClose() {
    setNewDateTime('')
    setDurationMinutes('30')
    setError('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reagendar consulta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-datetime">Nova data e hora *</Label>
            <Input
              id="reschedule-datetime"
              type="datetime-local"
              value={newDateTime}
              onChange={(e) => {
                setNewDateTime(e.target.value)
                if (error) setError('')
              }}
              error={!!error}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-duration">Duração (minutos)</Label>
            <Input
              id="reschedule-duration"
              type="number"
              min="15"
              max="240"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={isPending}>
              Confirmar reagendamento
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface CompleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (notes?: string) => void
  isPending: boolean
}

function CompleteDialog({ open, onOpenChange, onConfirm, isPending }: CompleteDialogProps) {
  const [notes, setNotes] = React.useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConfirm(notes.trim() || undefined)
  }

  function handleClose() {
    setNotes('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalizar consulta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="complete-notes">Notas (opcional)</Label>
            <Textarea
              id="complete-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações finais sobre a consulta..."
              rows={3}
              className="border-[#e8dfc8] focus-visible:ring-amber-dark/30 resize-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={isPending}>
              Finalizar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Botões de ação por status ────────────────────────────────────────────────

interface ActionButtonsProps {
  status: AppointmentStatus
  appointmentId: string
}

function ActionButtons({ status, appointmentId }: ActionButtonsProps) {
  const updateStatus = useUpdateAppointmentStatus(appointmentId)

  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false)
  const [completeOpen, setCompleteOpen] = React.useState(false)

  const isPending = updateStatus.isPending

  function handleSimpleTransition(newStatus: 'waiting' | 'in_progress' | 'no_show') {
    updateStatus.mutate(
      { status: newStatus },
      {
        onSuccess: () => {
          toast.success(`Status atualizado: ${appointmentStatusLabels[newStatus]}`)
        },
        onError: (err: Error & { data?: { message?: string } }) => {
          toast.error(err.data?.message ?? 'Erro ao atualizar status.')
        },
      },
    )
  }

  function handleCancel(reason: string) {
    updateStatus.mutate(
      { status: 'cancelled', cancellationReason: reason },
      {
        onSuccess: () => {
          toast.success('Consulta cancelada.')
          setCancelOpen(false)
        },
        onError: (err: Error & { data?: { message?: string } }) => {
          toast.error(err.data?.message ?? 'Erro ao cancelar consulta.')
        },
      },
    )
  }

  function handleReschedule(newDateTime: string, newDurationMinutes: number) {
    updateStatus.mutate(
      { status: 'rescheduled', newDateTime, newDurationMinutes },
      {
        onSuccess: () => {
          toast.success('Consulta reagendada com sucesso.')
          setRescheduleOpen(false)
        },
        onError: (err: Error & { data?: { message?: string } }) => {
          toast.error(err.data?.message ?? 'Erro ao reagendar consulta.')
        },
      },
    )
  }

  function handleComplete(notes?: string) {
    updateStatus.mutate(
      { status: 'completed', ...(notes ? { notes } : {}) },
      {
        onSuccess: () => {
          toast.success('Consulta finalizada.')
          setCompleteOpen(false)
        },
        onError: (err: Error & { data?: { message?: string } }) => {
          toast.error(err.data?.message ?? 'Erro ao finalizar consulta.')
        },
      },
    )
  }

  // Terminais — sem ações
  if (['completed', 'cancelled', 'no_show', 'rescheduled'].includes(status)) {
    return (
      <div className="rounded-lg border border-[#e8dfc8] bg-[#f5f0e8] p-4 text-sm text-amber-mid text-center">
        Consulta encerrada — nenhuma ação disponível.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-amber-dark">Ações disponíveis</h3>
      <div className="flex flex-wrap gap-2">
        {status === 'scheduled' && (
          <>
            <Button
              size="sm"
              onClick={() => handleSimpleTransition('waiting')}
              loading={isPending}
              disabled={isPending}
            >
              Chamar paciente
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRescheduleOpen(true)}
              disabled={isPending}
            >
              Reagendar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSimpleTransition('no_show')}
              loading={isPending}
              disabled={isPending}
            >
              Não compareceu
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setCancelOpen(true)}
              disabled={isPending}
            >
              Cancelar
            </Button>
          </>
        )}

        {status === 'waiting' && (
          <>
            <Button
              size="sm"
              onClick={() => handleSimpleTransition('in_progress')}
              loading={isPending}
              disabled={isPending}
            >
              Iniciar atendimento
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSimpleTransition('no_show')}
              loading={isPending}
              disabled={isPending}
            >
              Não compareceu
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setCancelOpen(true)}
              disabled={isPending}
            >
              Cancelar
            </Button>
          </>
        )}

        {status === 'in_progress' && (
          <Button
            size="sm"
            onClick={() => setCompleteOpen(true)}
            disabled={isPending}
          >
            Finalizar consulta
          </Button>
        )}
      </div>

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancel}
        isPending={isPending}
      />
      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        onConfirm={handleReschedule}
        isPending={isPending}
      />
      <CompleteDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        onConfirm={handleComplete}
        isPending={isPending}
      />
    </div>
  )
}

// ─── Skeleton de carregamento ─────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function DoctorAppointmentDetailPage() {
  const { appointmentId } = useParams({ strict: false }) as { appointmentId: string }

  const [addNoteOpen, setAddNoteOpen] = React.useState(false)

  const { data, isLoading, isError } = useQuery(appointmentDetailQueryOptions(appointmentId))

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <DetailSkeleton />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <Link
          to="/doctor/appointments"
          className="inline-flex items-center gap-1.5 text-sm text-blue-steel hover:text-amber-dark transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Consultas
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
          Consulta não encontrada ou erro ao carregar.
        </div>
      </div>
    )
  }

  const { appointment, patient, clinicalNotes } = data

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-amber-mid">
        <Link
          to="/doctor/appointments"
          className="hover:text-amber-dark transition-colors"
        >
          Consultas
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-amber-dark font-medium">
          {formatDateTime(appointment.date_time)}
        </span>
      </nav>

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-bright/20 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-amber-dark" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-amber-dark font-heading">
              Consulta — {formatDateTime(appointment.date_time)}
            </h1>
            <p className="text-sm text-amber-mid">{appointment.duration_minutes} minutos</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${appointmentStatusStyles[appointment.status]}`}
        >
          {appointmentStatusLabels[appointment.status]}
        </span>
      </div>

      {/* Cards — paciente e dados da consulta */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Card do paciente */}
        <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-dark flex items-center gap-2 mb-3">
            <User className="w-4 h-4" />
            Paciente
          </h2>
          {patient ? (
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Nome</p>
                <p className="text-amber-dark font-medium">{patient.name}</p>
              </div>
              <div>
                <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Telefone</p>
                <p className="text-amber-dark">{patient.phone}</p>
              </div>
              {patient.email && (
                <div>
                  <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Email</p>
                  <p className="text-amber-dark">{patient.email}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Status</p>
                <p className="text-amber-dark capitalize">{patient.status === 'active' ? 'Ativo' : 'Inativo'}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-mid">Dados do paciente indisponíveis.</p>
          )}
        </div>

        {/* Card da consulta */}
        <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-dark flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" />
            Dados da consulta
          </h2>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Data / Hora</p>
              <p className="text-amber-dark font-medium">{formatDateTime(appointment.date_time)}</p>
            </div>
            <div>
              <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Duração</p>
              <p className="text-amber-dark">{appointment.duration_minutes} min</p>
            </div>
            <div>
              <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Criado por</p>
              <p className="text-amber-dark capitalize">{appointment.created_by === 'doctor' ? 'Médico' : 'Agente'}</p>
            </div>
            <div>
              <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Cadastrado em</p>
              <p className="text-amber-dark">{formatDate(appointment.created_at)}</p>
            </div>
            {appointment.started_at && (
              <div>
                <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Iniciado em</p>
                <p className="text-amber-dark">{formatDateTime(appointment.started_at)}</p>
              </div>
            )}
            {appointment.completed_at && (
              <div>
                <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Concluído em</p>
                <p className="text-amber-dark">{formatDateTime(appointment.completed_at)}</p>
              </div>
            )}
            {appointment.cancellation_reason && (
              <div>
                <p className="text-xs text-amber-mid uppercase tracking-wide mb-0.5">Motivo do cancelamento</p>
                <p className="text-amber-dark">{appointment.cancellation_reason}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 shadow-sm">
        <ActionButtons status={appointment.status} appointmentId={appointment.id} />
      </div>

      {/* Notas clínicas */}
      <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-amber-dark flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Notas clínicas
            {clinicalNotes.length > 0 && (
              <span className="ml-1 text-xs font-normal text-amber-mid">({clinicalNotes.length})</span>
            )}
          </h2>
          {patient && (
            <Button size="sm" onClick={() => setAddNoteOpen(true)}>
              <Plus className="w-4 h-4" />
              Adicionar nota
            </Button>
          )}
        </div>

        {clinicalNotes.length === 0 ? (
          <div className="text-center py-6 text-amber-mid">
            <FileText className="w-8 h-8 mx-auto mb-2 text-amber-bright opacity-50" />
            <p className="text-sm">Nenhuma nota clínica registrada para esta consulta.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clinicalNotes.map((note) => (
              <div key={note.id} className="rounded-lg border border-[#e8dfc8] bg-[#f5f0e8] p-4 space-y-1">
                <p className="text-xs text-amber-mid">{formatDateTime(note.created_at)}</p>
                <p className="text-sm text-amber-dark whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog de adicionar nota — só renderiza se patient existir */}
      {patient && (
        <CreateClinicalNoteDialog
          open={addNoteOpen}
          onOpenChange={setAddNoteOpen}
          appointmentId={appointment.id}
          patientId={patient.id}
        />
      )}
    </div>
  )
}
