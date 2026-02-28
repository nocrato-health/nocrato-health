import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { membersQueryOptions, useUpdateMemberStatus } from '@/lib/queries/agency'
import { StatusBadge } from '@/components/status-badge'
import { PaginationControls } from '@/components/pagination-controls'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Member } from '@/types/api'

type StatusFilter = '' | 'active' | 'inactive' | 'pending'

const roleLabels: Record<Member['role'], string> = {
  agency_admin: 'Admin',
  agency_member: 'Colaborador',
}

function MemberRow({ member }: { member: Member }) {
  const updateStatus = useUpdateMemberStatus()
  const nextStatus: 'active' | 'inactive' =
    member.status === 'active' ? 'inactive' : 'active'

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-3 px-4 text-sm font-medium text-gray-900">{member.name}</td>
      <td className="py-3 px-4 text-sm text-gray-600">{member.email}</td>
      <td className="py-3 px-4 text-sm text-gray-600">{roleLabels[member.role]}</td>
      <td className="py-3 px-4">
        <StatusBadge status={member.status} />
      </td>
      <td className="py-3 px-4">
        {member.status !== 'pending' && (
          <Button
            variant="ghost"
            size="sm"
            loading={updateStatus.isPending}
            onClick={() => updateStatus.mutate({ id: member.id, status: nextStatus })}
          >
            {member.status === 'active' ? 'Desativar' : 'Ativar'}
          </Button>
        )}
      </td>
    </tr>
  )
}

export function AgencyMembersPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')

  const { data, isLoading, isError } = useQuery(
    membersQueryOptions({ page, limit: 10, status: statusFilter || undefined }),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-dark">Colaboradores</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie os membros da agência</p>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor="member-status-filter" className="text-sm">
          Filtrar por status:
        </Label>
        <select
          id="member-status-filter"
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
          <option value="pending">Pendente</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center h-32">
          <p className="text-red-600 text-sm">Erro ao carregar colaboradores.</p>
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
                    Cargo
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
                    <td colSpan={5} className="py-10 text-center text-sm text-gray-400">
                      Nenhum colaborador encontrado.
                    </td>
                  </tr>
                ) : (
                  data.data.map((member) => <MemberRow key={member.id} member={member} />)
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
