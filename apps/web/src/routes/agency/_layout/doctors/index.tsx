import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  doctorsQueryOptions,
  useUpdateDoctorStatus,
  useInviteDoctor,
} from '@/lib/queries/agency'
import { StatusBadge } from '@/components/status-badge'
import { PaginationControls } from '@/components/pagination-controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DoctorListItem } from '@/types/api'

type StatusFilter = '' | 'active' | 'inactive'

function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inviteDoctor = useInviteDoctor()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await inviteDoctor.mutateAsync({ email })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar convite')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-bold text-amber-dark font-heading">Convidar Doutor</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="doutor@clinica.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={inviteDoctor.isPending}>
              Enviar convite
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DoctorRow({ doctor }: { doctor: DoctorListItem }) {
  const updateStatus = useUpdateDoctorStatus()
  const nextStatus = doctor.status === 'active' ? 'inactive' : 'active'

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-3 px-4 text-sm font-medium text-gray-900">{doctor.name}</td>
      <td className="py-3 px-4 text-sm text-gray-600">{doctor.email}</td>
      <td className="py-3 px-4 text-sm text-gray-500 font-mono">{doctor.slug}</td>
      <td className="py-3 px-4 text-sm text-gray-600">{doctor.specialty ?? '—'}</td>
      <td className="py-3 px-4">
        <StatusBadge status={doctor.status} />
      </td>
      <td className="py-3 px-4">
        <Button
          variant="ghost"
          size="sm"
          loading={updateStatus.isPending}
          onClick={() => updateStatus.mutate({ id: doctor.id, status: nextStatus })}
        >
          {doctor.status === 'active' ? 'Desativar' : 'Ativar'}
        </Button>
      </td>
    </tr>
  )
}

export function AgencyDoctorsPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [showInviteModal, setShowInviteModal] = useState(false)

  const { data, isLoading, isError } = useQuery(
    doctorsQueryOptions({ page, limit: 10, status: statusFilter || undefined }),
  )

  return (
    <div className="space-y-6">
      {showInviteModal && <InviteModal onClose={() => setShowInviteModal(false)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-amber-dark">Doutores</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie os doutores cadastrados</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)}>Convidar Doutor</Button>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor="status-filter" className="text-sm">
          Filtrar por status:
        </Label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter)
            setPage(1)
          }}
          className="rounded-md border border-blue-steel/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-bright"
        >
          <option value="">Todos</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center h-32">
          <p className="text-red-600 text-sm">Erro ao carregar doutores.</p>
        </div>
      )}

      {data && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Nome
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Email
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Slug
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Especialidade
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-gray-400">
                      Nenhum doutor encontrado.
                    </td>
                  </tr>
                ) : (
                  data.data.map((doctor) => <DoctorRow key={doctor.id} doctor={doctor} />)
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
