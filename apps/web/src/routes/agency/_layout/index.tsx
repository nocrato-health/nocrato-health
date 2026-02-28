import { useQuery } from '@tanstack/react-query'
import { dashboardQueryOptions } from '@/lib/queries/agency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StatCardProps {
  label: string
  value: number | undefined
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-3xl">
          {value !== undefined ? value.toLocaleString('pt-BR') : '—'}
        </CardTitle>
      </CardContent>
    </Card>
  )
}

export function AgencyDashboardPage() {
  const { data, isLoading, isError } = useQuery(dashboardQueryOptions())

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-gray-500 text-sm">Carregando...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-red-600 text-sm">Erro ao carregar dados do dashboard.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-dark">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Visão geral da agência</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="Total de Doutores" value={data?.totalDoctors} />
        <StatCard label="Doutores Ativos" value={data?.activeDoctors} />
        <StatCard label="Total de Pacientes" value={data?.totalPatients} />
        <StatCard label="Total de Consultas" value={data?.totalAppointments} />
        <StatCard label="Consultas Futuras" value={data?.upcomingAppointments} />
      </div>
    </div>
  )
}
