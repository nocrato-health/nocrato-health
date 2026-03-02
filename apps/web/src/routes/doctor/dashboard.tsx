import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, Calendar, Users, AlertCircle, ArrowRight, Clock } from 'lucide-react'

import { dashboardQueryOptions } from '@/lib/queries/appointments'
import { formatDateTime } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { AppointmentStatus } from '@/types/api'

// ─── Status badge para consultas ──────────────────────────────────────────────

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

// ─── Skeleton de carregamento ─────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#e8dfc8] bg-white p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function DoctorDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    ...dashboardQueryOptions(),
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-amber-dark font-heading flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6" />
            Dashboard
          </h1>
          <p className="text-sm text-[#6c85a0] mt-1">Visão geral do seu consultório</p>
        </div>
        <DashboardSkeleton />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-amber-dark font-heading flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6" />
          Dashboard
        </h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
          Erro ao carregar dados do dashboard. Tente novamente.
        </div>
      </div>
    )
  }

  const { todayAppointments, totalPatients, pendingFollowUps } = data

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-amber-dark font-heading flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6" />
          Dashboard
        </h1>
        <p className="text-sm text-[#6c85a0] mt-1">Visão geral do seu consultório</p>
      </div>

      {/* Cards de stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* Consultas hoje */}
        <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-[#6c85a0] mb-2">
            <Calendar className="w-4 h-4 text-amber-bright" />
            Consultas hoje
          </div>
          <p className="text-3xl font-bold text-amber-dark">{todayAppointments.length}</p>
        </div>

        {/* Total pacientes */}
        <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-[#6c85a0] mb-2">
            <Users className="w-4 h-4 text-blue-steel" />
            Total de pacientes
          </div>
          <p className="text-3xl font-bold text-amber-dark">{totalPatients}</p>
        </div>

        {/* Seguimentos pendentes */}
        <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-[#6c85a0] mb-2">
            <AlertCircle className="w-4 h-4 text-orange" />
            Seguimentos pendentes
          </div>
          <p className="text-3xl font-bold text-amber-dark">{pendingFollowUps}</p>
        </div>
      </div>

      {/* Consultas de hoje */}
      <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-amber-dark flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Consultas de hoje
          </h2>
          <Link
            to="/doctor/appointments"
            className="text-sm text-blue-steel hover:text-amber-dark transition-colors flex items-center gap-1"
          >
            Ver todas
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {todayAppointments.length === 0 ? (
          <div className="text-center py-8 text-[#6c85a0]">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-amber-bright opacity-50" />
            <p className="text-sm font-medium text-amber-dark">Nenhuma consulta agendada para hoje</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayAppointments.map((appt) => (
              <Link
                key={appt.id}
                to="/doctor/appointments/$appointmentId"
                params={{ appointmentId: appt.id }}
                className="flex items-center justify-between p-3 rounded-lg border border-[#e8dfc8] hover:border-amber-bright hover:bg-[#f5f0e8] transition-all"
              >
                <div>
                  <p className="text-sm font-medium text-amber-dark">
                    {formatDateTime(appt.date_time)}
                  </p>
                  <p className="text-xs text-[#6c85a0] mt-0.5">
                    {appt.duration_minutes} min
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${appointmentStatusStyles[appt.status]}`}
                >
                  {appointmentStatusLabels[appt.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
