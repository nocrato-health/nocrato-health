import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Users, Search, UserPlus } from 'lucide-react'

import { patientsQueryOptions, useCreatePatient } from '@/lib/queries/patients'
import { formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { PaginationControls } from '@/components/pagination-controls'

// ─── Schema de criação ─────────────────────────────────────────────────────────

const createPatientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  phone: z.string().min(8, 'Telefone inválido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
})

type CreatePatientForm = z.infer<typeof createPatientSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sourceLabels: Record<string, string> = {
  manual: 'Manual',
  agent: 'Agente',
}

// ─── Dialog de novo paciente ──────────────────────────────────────────────────

interface NewPatientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function NewPatientDialog({ open, onOpenChange }: NewPatientDialogProps) {
  const createPatient = useCreatePatient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePatientForm>({
    resolver: zodResolver(createPatientSchema),
  })

  function onSubmit(data: CreatePatientForm) {
    const payload = {
      name: data.name,
      phone: data.phone,
      ...(data.email ? { email: data.email } : {}),
    }
    createPatient.mutate(payload, {
      onSuccess: () => {
        toast.success('Paciente cadastrado com sucesso!')
        reset()
        onOpenChange(false)
      },
      onError: (err: Error & { data?: { message?: string } }) => {
        const msg = err.data?.message ?? 'Erro ao cadastrar paciente.'
        toast.error(msg)
      },
    })
  }

  function handleOpenChange(value: boolean) {
    if (!value) reset()
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar paciente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-name">Nome completo *</Label>
            <Input
              id="np-name"
              placeholder="Nome do paciente"
              {...register('name')}
              error={!!errors.name}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-phone">Telefone *</Label>
            <Input
              id="np-phone"
              placeholder="(11) 99999-9999"
              {...register('phone')}
              error={!!errors.phone}
            />
            {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-email">Email (opcional)</Label>
            <Input
              id="np-email"
              type="email"
              placeholder="paciente@email.com"
              {...register('email')}
              error={!!errors.email}
            />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting || createPatient.isPending}>
              Cadastrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Skeletons de carregamento ────────────────────────────────────────────────

function PatientCardSkeleton() {
  return (
    <div className="rounded-lg border border-[#e8dfc8] bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-48" />
      <div className="flex justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function DoctorPatientsPage() {
  const navigate = useNavigate()
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'active' | 'inactive' | ''>('')
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const queryParams = {
    page,
    limit: 20,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  }

  const { data, isLoading, isError } = useQuery(patientsQueryOptions(queryParams))

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value)
    setPage(1)
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value as 'active' | 'inactive' | '')
    setPage(1)
  }

  const patients = data?.data ?? []
  const pagination = data?.pagination

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-amber-dark font-heading flex items-center gap-2">
            <Users className="w-6 h-6" />
            Pacientes
          </h1>
          <p className="text-sm text-amber-mid mt-1">Gerencie os pacientes do seu consultório</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="w-4 h-4" />
          Novo paciente
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-mid" />
          <Input
            placeholder="Buscar paciente por nome ou telefone..."
            value={search}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos os status</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista de pacientes */}
      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PatientCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
          Erro ao carregar pacientes. Tente novamente.
        </div>
      )}

      {!isLoading && !isError && patients.length === 0 && (
        <div className="rounded-xl border border-[#e8dfc8] bg-white p-12 text-center">
          <Users className="w-10 h-10 text-amber-bright mx-auto mb-3 opacity-50" />
          <p className="text-amber-dark font-medium">Nenhum paciente encontrado</p>
          <p className="text-sm text-amber-mid mt-1">
            {search || statusFilter
              ? 'Tente ajustar os filtros de busca.'
              : 'Cadastre o primeiro paciente clicando em "Novo paciente".'}
          </p>
        </div>
      )}

      {!isLoading && patients.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((patient) => (
              <button
                key={patient.id}
                type="button"
                onClick={() => void navigate({ to: '/doctor/patients/$patientId', params: { patientId: patient.id } })}
                className="rounded-lg border border-[#e8dfc8] bg-white shadow-sm p-4 text-left hover:border-amber-bright hover:shadow-md transition-all cursor-pointer space-y-2.5 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-amber-dark text-sm leading-tight group-hover:text-amber-mid transition-colors line-clamp-1">
                    {patient.name}
                  </span>
                  <StatusBadge status={patient.status} />
                </div>

                <p className="text-sm text-amber-mid">{patient.phone}</p>

                {patient.email && (
                  <p className="text-xs text-amber-mid/70 truncate">{patient.email}</p>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-[#e8dfc8]">
                  <span className="text-xs text-amber-mid">
                    Origem: {sourceLabels[patient.source] ?? patient.source}
                  </span>
                  <span className="text-xs text-amber-mid">
                    {formatDate(patient.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <PaginationControls
              page={page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* Dialog de novo paciente */}
      <NewPatientDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
