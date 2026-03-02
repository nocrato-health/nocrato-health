import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Calendar, CalendarPlus, Search } from 'lucide-react'

import {
  appointmentsQueryOptions,
  patientsSearchQueryOptions,
  useCreateAppointment,
  type AppointmentsQueryParams,
} from '@/lib/queries/appointments'
import { formatDateTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PaginationControls } from '@/components/pagination-controls'
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

// ─── Dialog de nova consulta ──────────────────────────────────────────────────

interface NewAppointmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function NewAppointmentDialog({ open, onOpenChange }: NewAppointmentDialogProps) {
  const createAppointment = useCreateAppointment()

  const [patientSearch, setPatientSearch] = React.useState('')
  const [selectedPatientId, setSelectedPatientId] = React.useState('')
  const [selectedPatientName, setSelectedPatientName] = React.useState('')
  const [dateTime, setDateTime] = React.useState('')
  const [durationMinutes, setDurationMinutes] = React.useState('30')
  const [notes, setNotes] = React.useState('')
  const [showPatientDropdown, setShowPatientDropdown] = React.useState(false)
  const [errors, setErrors] = React.useState<{ patient?: string; dateTime?: string }>({})

  const patientSearchQuery = useQuery({
    ...patientsSearchQueryOptions(patientSearch),
    enabled: patientSearch.length >= 2,
  })

  const patients = patientSearchQuery.data?.data ?? []

  function handleSelectPatient(id: string, name: string) {
    setSelectedPatientId(id)
    setSelectedPatientName(name)
    setPatientSearch(name)
    setShowPatientDropdown(false)
    setErrors((prev) => ({ ...prev, patient: undefined }))
  }

  function handlePatientSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setPatientSearch(value)
    setSelectedPatientId('')
    setSelectedPatientName('')
    setShowPatientDropdown(true)
  }

  function validate(): boolean {
    const newErrors: typeof errors = {}
    if (!selectedPatientId) newErrors.patient = 'Selecione um paciente da lista'
    if (!dateTime) newErrors.dateTime = 'Informe a data e hora da consulta'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    createAppointment.mutate(
      {
        patientId: selectedPatientId,
        dateTime: new Date(dateTime).toISOString(),
        durationMinutes: Number(durationMinutes),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Consulta criada com sucesso!')
          handleClose()
        },
        onError: (err: Error & { data?: { message?: string } }) => {
          const msg = err.data?.message ?? 'Erro ao criar consulta.'
          toast.error(msg)
        },
      },
    )
  }

  function handleClose() {
    setPatientSearch('')
    setSelectedPatientId('')
    setSelectedPatientName('')
    setDateTime('')
    setDurationMinutes('30')
    setNotes('')
    setErrors({})
    setShowPatientDropdown(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova consulta</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Busca de paciente */}
          <div className="space-y-1.5">
            <Label htmlFor="na-patient">Paciente *</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6c85a0]" />
              <Input
                id="na-patient"
                placeholder="Buscar paciente por nome..."
                value={patientSearch}
                onChange={handlePatientSearchChange}
                onFocus={() => setShowPatientDropdown(true)}
                className="pl-9"
                error={!!errors.patient}
                autoComplete="off"
              />
              {showPatientDropdown && patientSearch.length >= 2 && patients.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-[#e8dfc8] bg-white shadow-lg">
                  <div className="py-1 max-h-48 overflow-y-auto">
                    {patients.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPatient(p.id, p.name)}
                        className="flex w-full items-start px-3 py-2 text-sm hover:bg-amber-bright/10 text-left transition-colors"
                      >
                        <span className="font-medium text-amber-dark">{p.name}</span>
                        <span className="ml-2 text-[#6c85a0]">{p.phone}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {errors.patient && <p className="text-xs text-red-500">{errors.patient}</p>}
            {selectedPatientName && (
              <p className="text-xs text-[#6c85a0]">
                Selecionado: <span className="font-medium text-amber-dark">{selectedPatientName}</span>
              </p>
            )}
          </div>

          {/* Data e hora */}
          <div className="space-y-1.5">
            <Label htmlFor="na-datetime">Data e hora *</Label>
            <Input
              id="na-datetime"
              type="datetime-local"
              value={dateTime}
              onChange={(e) => {
                setDateTime(e.target.value)
                setErrors((prev) => ({ ...prev, dateTime: undefined }))
              }}
              error={!!errors.dateTime}
            />
            {errors.dateTime && <p className="text-xs text-red-500">{errors.dateTime}</p>}
          </div>

          {/* Duração */}
          <div className="space-y-1.5">
            <Label>Duração</Label>
            <Select value={durationMinutes} onValueChange={setDurationMinutes}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar duração" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="45">45 minutos</SelectItem>
                <SelectItem value="60">60 minutos</SelectItem>
                <SelectItem value="90">90 minutos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="na-notes">Notas (opcional)</Label>
            <textarea
              id="na-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações sobre a consulta..."
              rows={3}
              className="w-full rounded-md border border-[#e8dfc8] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-dark/30 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={createAppointment.isPending}>
              Criar consulta
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Skeleton de carregamento ─────────────────────────────────────────────────

function AppointmentRowSkeleton() {
  return (
    <tr className="border-b border-[#e8dfc8]">
      <td className="py-3 px-4"><Skeleton className="h-4 w-36" /></td>
      <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
      <td className="py-3 px-4"><Skeleton className="h-4 w-16" /></td>
      <td className="py-3 px-4"><Skeleton className="h-5 w-24 rounded-full" /></td>
      <td className="py-3 px-4"><Skeleton className="h-4 w-16" /></td>
    </tr>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function DoctorAppointmentsPage() {
  const navigate = useNavigate()
  const [page, setPage] = React.useState(1)
  const [statusFilter, setStatusFilter] = React.useState<AppointmentStatus | ''>('')
  const [dateFilter, setDateFilter] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const queryParams: AppointmentsQueryParams = {
    page,
    limit: 20,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(dateFilter ? { date: dateFilter } : {}),
  }

  const { data, isLoading, isError } = useQuery(appointmentsQueryOptions(queryParams))

  function handleStatusChange(value: string) {
    setStatusFilter(value as AppointmentStatus | '')
    setPage(1)
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDateFilter(e.target.value)
    setPage(1)
  }

  function handleClearFilters() {
    setStatusFilter('')
    setDateFilter('')
    setPage(1)
  }

  const appointments = data?.data ?? []
  const pagination = data?.pagination
  const hasFilters = !!statusFilter || !!dateFilter

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-amber-dark font-heading flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Consultas
          </h1>
          <p className="text-sm text-[#6c85a0] mt-1">Gerencie as consultas do seu consultório</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <CalendarPlus className="w-4 h-4" />
          Nova consulta
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label htmlFor="filter-date" className="text-xs text-[#6c85a0]">Data</Label>
          <Input
            id="filter-date"
            type="date"
            value={dateFilter}
            onChange={handleDateChange}
            className="w-44"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-[#6c85a0]">Status</Label>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos os status</SelectItem>
              <SelectItem value="scheduled">Agendada</SelectItem>
              <SelectItem value="waiting">Aguardando</SelectItem>
              <SelectItem value="in_progress">Em atendimento</SelectItem>
              <SelectItem value="completed">Concluída</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
              <SelectItem value="no_show">Não compareceu</SelectItem>
              <SelectItem value="rescheduled">Reagendada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="mb-0.5">
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-[#e8dfc8] bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e8dfc8] bg-[#f5f0e8]">
              <th className="py-3 px-4 text-left text-xs font-semibold text-[#6c85a0] uppercase tracking-wide">Data / Hora</th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-[#6c85a0] uppercase tracking-wide">Paciente</th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-[#6c85a0] uppercase tracking-wide">Duração</th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-[#6c85a0] uppercase tracking-wide">Status</th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-[#6c85a0] uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              Array.from({ length: 5 }).map((_, i) => <AppointmentRowSkeleton key={i} />)
            )}

            {isError && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-red-600">
                  Erro ao carregar consultas. Tente novamente.
                </td>
              </tr>
            )}

            {!isLoading && !isError && appointments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center">
                  <Calendar className="w-10 h-10 text-amber-bright mx-auto mb-3 opacity-50" />
                  <p className="text-amber-dark font-medium">Nenhuma consulta encontrada</p>
                  <p className="text-xs text-[#6c85a0] mt-1">
                    {hasFilters
                      ? 'Tente ajustar os filtros.'
                      : 'Crie a primeira consulta clicando em "Nova consulta".'}
                  </p>
                </td>
              </tr>
            )}

            {!isLoading && appointments.map((appt) => (
              <tr
                key={appt.id}
                className="border-b border-[#e8dfc8] last:border-0 hover:bg-[#f5f0e8] transition-colors"
              >
                <td className="py-3 px-4 text-amber-dark font-medium">
                  {formatDateTime(appt.date_time)}
                </td>
                <td className="py-3 px-4 text-[#6c85a0] font-mono text-xs">
                  #{appt.patient_id.slice(0, 8)}
                </td>
                <td className="py-3 px-4 text-[#6c85a0]">
                  {appt.duration_minutes} min
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${appointmentStatusStyles[appt.status]}`}
                  >
                    {appointmentStatusLabels[appt.status]}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void navigate({
                        to: '/doctor/appointments/$appointmentId',
                        params: { appointmentId: appt.id },
                      })
                    }
                  >
                    Ver detalhe
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <PaginationControls
          page={page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
        />
      )}

      <NewAppointmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
