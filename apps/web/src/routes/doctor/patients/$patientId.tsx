import * as React from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ChevronRight, Eye, EyeOff, FileText, Calendar, Paperclip, User, Upload, ClipboardList } from 'lucide-react'

import {
  patientProfileQueryOptions,
  useUpdatePatient,
  usePatientDocumentQuery,
  type UpdatePatientPayload,
} from '@/lib/queries/patients'
import { maskCpf, unmaskDocument } from '@/lib/masks'
import { downloadDocument } from '@/lib/download'
import type { PatientAppointment } from '@/types/api'
import { formatDate, formatDateTime, formatPhone } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { DocumentUploadDialog } from '@/components/doctor/DocumentUploadDialog'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sourceLabels: Record<string, string> = {
  manual: 'Manual',
  agent: 'Agente WhatsApp',
}

const appointmentStatusLabels: Record<PatientAppointment['status'], string> = {
  scheduled: 'Agendada',
  waiting: 'Aguardando',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
  rescheduled: 'Reagendada',
}

const appointmentStatusStyles: Record<PatientAppointment['status'], string> = {
  scheduled: 'bg-blue-steel/10 text-blue-steel',
  waiting: 'bg-[#fabe01]/15 text-amber-dark',
  in_progress: 'bg-orange/10 text-orange',
  completed: 'bg-[#6e5305]/10 text-amber-dark',
  cancelled: 'bg-red-100 text-red-600',
  no_show: 'bg-gray-100 text-gray-500',
  rescheduled: 'bg-purple-100 text-purple-700',
}

const documentTypeLabels: Record<string, string> = {
  prescription: 'Receita',
  certificate: 'Atestado',
  exam: 'Exame',
  other: 'Outro',
}

// ─── Schema de edição ─────────────────────────────────────────────────────────

const updatePatientSchema = z
  .object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    phone: z.string().min(8, 'Telefone inválido'),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    status: z.enum(['active', 'inactive']),
    documentType: z.enum(['cpf', 'rg', '']).optional(),
    document: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasType = !!data.documentType
      const hasDoc = !!data.document && data.document.trim() !== ''
      // Ambos presentes, ou nenhum — parcial é inválido
      return (!hasType && !hasDoc) || (hasType && hasDoc)
    },
    {
      message: 'Informe o tipo E o número do documento, ou deixe ambos em branco',
      path: ['document'],
    },
  )

type UpdatePatientForm = z.infer<typeof updatePatientSchema>

// ─── Componente de revelação de documento ─────────────────────────────────────

interface PatientDocumentRevealProps {
  patientId: string
  documentType: 'cpf' | 'rg'
}

function PatientDocumentReveal({ patientId, documentType }: Readonly<PatientDocumentRevealProps>) {
  const [visible, setVisible] = React.useState(false)
  const { data, isFetching, refetch, error } = usePatientDocumentQuery(patientId)

  // Limpar estado local ao trocar de paciente
  React.useEffect(() => {
    setVisible(false)
  }, [patientId])

  async function handleReveal() {
    const result = await refetch()
    if (result.error) {
      toast.error('Erro ao carregar documento.')
      return
    }
    setVisible(true)
  }

  const label = documentType === 'cpf' ? 'CPF' : 'RG'

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => void handleReveal()}
        disabled={isFetching}
        className="inline-flex items-center gap-1.5 text-sm text-blue-steel underline underline-offset-2 hover:text-amber-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={`Ver ${label} do paciente`}
      >
        <Eye className="w-3.5 h-3.5" />
        {isFetching ? 'Carregando...' : `Ver ${label}`}
      </button>
    )
  }

  function formatDoc(raw: string): string {
    if (documentType === 'cpf') return maskCpf(raw)
    return raw
  }

  const formattedDoc = data?.document ? formatDoc(data.document) : null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {error || !formattedDoc ? (
        <span className="text-sm text-red-500">Erro ao carregar</span>
      ) : (
        <span
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-bright/10 border border-amber-bright/30 px-2.5 py-1 text-sm font-mono font-medium text-amber-dark"
          aria-live="polite"
        >
          {formattedDoc}
        </span>
      )}
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="inline-flex items-center gap-1 text-xs text-amber-mid hover:text-amber-dark transition-colors"
        aria-label="Ocultar documento"
      >
        <EyeOff className="w-3.5 h-3.5" />
        Ocultar
      </button>
    </div>
  )
}

// ─── Tab: Informações ─────────────────────────────────────────────────────────

interface InfoTabProps {
  patientId: string
  patient: {
    name: string
    phone: string
    email?: string
    status: 'active' | 'inactive'
    source: 'manual' | 'agent'
    created_at: string
    portal_active: boolean
    document_type?: 'cpf' | 'rg' | null
  }
}

function InfoTab({ patientId, patient }: InfoTabProps) {
  const updatePatient = useUpdatePatient(patientId)

  // Buscar dados completos para a sidebar
  const { data } = useQuery(patientProfileQueryOptions(patientId))
  const appointments = data?.appointments ?? []
  const documents = data?.documents ?? []
  const clinicalNotes = data?.clinicalNotes ?? []

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<UpdatePatientForm>({
    resolver: zodResolver(updatePatientSchema),
    defaultValues: {
      name: patient.name,
      phone: patient.phone,
      email: patient.email ?? '',
      status: patient.status,
      // Tipo preenchido conforme o que o backend retornou; valor do documento vem vazio
      // (dado sensível — o doutor precisa clicar "Ver documento" para carregar)
      documentType: patient.document_type ?? '',
      document: '',
    },
  })

  const watchedStatus = watch('status')
  const watchedDocType = watch('documentType')
  const watchedDoc = watch('document') ?? ''

  function docPlaceholder(): string {
    if (watchedDocType === 'cpf') return '000.000.000-00'
    if (watchedDocType === 'rg') return 'somente dígitos'
    return '—'
  }

  function handleDocumentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    if (watchedDocType === 'cpf') {
      setValue('document', maskCpf(raw), { shouldDirty: true })
    } else {
      setValue('document', raw.replaceAll(/\D/g, '').slice(0, 14), { shouldDirty: true })
    }
  }

  function onSubmit(formData: UpdatePatientForm) {
    const hasDocument =
      !!formData.documentType &&
      !!formData.document &&
      formData.document.trim() !== ''

    const payload: UpdatePatientPayload = {
      name: formData.name,
      phone: formData.phone,
      status: formData.status,
      ...(formData.email ? { email: formData.email } : {}),
      ...(hasDocument
        ? {
            documentType: formData.documentType as 'cpf' | 'rg',
            document: unmaskDocument(formData.document ?? ''),
          }
        : {}),
    }

    updatePatient.mutate(payload, {
      onSuccess: () => {
        toast.success('Paciente atualizado com sucesso!')
      },
      onError: (err: Error & { data?: { message?: string } }) => {
        const msg = err.data?.message ?? 'Erro ao atualizar paciente.'
        toast.error(msg)
      },
    })
  }

  const currentDocLabel = patient.document_type
    ? patient.document_type.toUpperCase()
    : 'documento'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Coluna esquerda — form (2/3 do espaço) */}
      <div className="lg:col-span-2">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pt-name">Nome completo</Label>
              <Input
                id="pt-name"
                {...register('name')}
                error={!!errors.name}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pt-phone">Telefone</Label>
              <Input
                id="pt-phone"
                value={watch('phone') ?? ''}
                onChange={(e) => setValue('phone', formatPhone(e.target.value))}
                error={!!errors.phone}
              />
              {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pt-email">Email</Label>
              <Input
                id="pt-email"
                type="email"
                {...register('email')}
                error={!!errors.email}
                placeholder="(não informado)"
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={watchedStatus}
                onValueChange={(val) =>
                  setValue('status', val as 'active' | 'inactive', { shouldDirty: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Documento de identificação */}
          <div className="rounded-lg border border-[#e8dfc8] bg-cream p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-medium text-amber-mid uppercase tracking-wide">
                Documento de identificação
              </p>
              {/* Botão "Ver documento" — só aparece se o paciente tem um tipo registrado */}
              {patient.document_type && (
                <PatientDocumentReveal
                  patientId={patientId}
                  documentType={patient.document_type}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pt-doc-type">Tipo</Label>
                <Select
                  value={watchedDocType ?? ''}
                  onValueChange={(val) => {
                    setValue('documentType', val as 'cpf' | 'rg' | '', { shouldDirty: true })
                    setValue('document', '', { shouldDirty: true })
                  }}
                >
                  <SelectTrigger id="pt-doc-type" aria-label="Tipo de documento">
                    <SelectValue placeholder="Não alterar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Não alterar</SelectItem>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="rg">RG</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pt-document">Novo número</Label>
                <Input
                  id="pt-document"
                  placeholder={docPlaceholder()}
                  value={watchedDoc}
                  onChange={handleDocumentChange}
                  disabled={!watchedDocType}
                  inputMode="numeric"
                  maxLength={14}
                  aria-label="Novo número do documento"
                  error={!!errors.document}
                />
              </div>
            </div>

            {errors.document && (
              <p className="text-xs text-red-500">{errors.document.message}</p>
            )}

            <p className="text-xs text-amber-mid">
              Preencha apenas se quiser atualizar o documento. O valor atual não é exibido por
              segurança — use &ldquo;Ver {currentDocLabel}&rdquo; acima para conferir.
            </p>
          </div>

          {/* Campos não editáveis */}
          <div className="rounded-lg border border-[#e8dfc8] bg-cream p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-amber-mid text-xs uppercase tracking-wide mb-1">Origem</p>
              <p className="text-amber-dark font-medium">{sourceLabels[patient.source] ?? patient.source}</p>
            </div>
            <div>
              <p className="text-amber-mid text-xs uppercase tracking-wide mb-1">Cadastrado em</p>
              <p className="text-amber-dark font-medium">{formatDate(patient.created_at)}</p>
            </div>
            <div>
              <p className="text-amber-mid text-xs uppercase tracking-wide mb-1">Portal do paciente</p>
              <p className="text-amber-dark font-medium">{patient.portal_active ? 'Ativo' : 'Inativo'}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!isDirty}
              loading={isSubmitting || updatePatient.isPending}
            >
              Salvar alterações
            </Button>
          </div>
        </form>
      </div>

      {/* Coluna direita — resumo (1/3) */}
      <div className="space-y-4">
        {/* Últimas consultas */}
        <div className="rounded-lg border border-[#e8dfc8] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-amber-dark flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Últimas consultas
          </h3>
          {appointments.slice(0, 3).map((apt) => (
            <div key={apt.id} className="flex items-center justify-between text-sm gap-2">
              <span className="text-amber-dark text-xs">{formatDateTime(apt.date_time)}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-dark/10 text-amber-dark capitalize">
                {apt.status}
              </span>
            </div>
          ))}
          {appointments.length === 0 && (
            <p className="text-sm text-amber-mid italic">Nenhuma consulta</p>
          )}
        </div>

        {/* Últimos documentos */}
        <div className="rounded-lg border border-[#e8dfc8] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-amber-dark flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documentos recentes
          </h3>
          {documents.slice(0, 3).map((doc) => (
            <div key={doc.id} className="flex items-center justify-between text-sm gap-2">
              <span className="text-amber-dark truncate text-xs">{doc.file_name || doc.type}</span>
              <span className="text-amber-mid text-xs whitespace-nowrap">{formatDate(doc.created_at)}</span>
            </div>
          ))}
          {documents.length === 0 && (
            <p className="text-sm text-amber-mid italic">Nenhum documento</p>
          )}
        </div>

        {/* Notas clínicas */}
        <div className="rounded-lg border border-[#e8dfc8] p-4 space-y-2">
          <h3 className="text-sm font-semibold text-amber-dark flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Notas clínicas
          </h3>
          <p className="text-2xl font-bold text-amber-dark">{clinicalNotes.length}</p>
          <p className="text-xs text-amber-mid">
            {clinicalNotes.length === 0 ? 'Nenhuma nota registrada' : 'nota(s) registrada(s)'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Consultas ───────────────────────────────────────────────────────────

interface AppointmentsTabProps {
  appointments: PatientAppointment[]
}

function AppointmentsTab({ appointments }: AppointmentsTabProps) {
  if (appointments.length === 0) {
    return (
      <div className="text-center py-12 text-amber-mid">
        <Calendar className="w-10 h-10 mx-auto mb-3 text-amber-bright opacity-50" />
        <p className="font-medium text-amber-dark">Nenhuma consulta registrada</p>
        <p className="text-sm mt-1">As consultas agendadas para este paciente aparecerão aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {appointments.map((appt) => (
        <div
          key={appt.id}
          className="rounded-lg border border-[#e8dfc8] bg-white p-4 flex items-center justify-between gap-4"
        >
          <div>
            <p className="font-medium text-sm text-amber-dark">{formatDateTime(appt.date_time)}</p>
            <p className="text-xs text-amber-mid mt-0.5">
              Duração: {appt.duration_minutes} min
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${appointmentStatusStyles[appt.status]}`}
          >
            {appointmentStatusLabels[appt.status]}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Notas clínicas ──────────────────────────────────────────────────────

interface NotesTabProps {
  notes: Array<{ id: string; content: string; created_at: string; appointment_id?: string }>
}

function NotesTab({ notes }: NotesTabProps) {
  // appointmentId é obrigatório no backend para criar nota clínica.
  // Notas são criadas a partir da página de detalhe da consulta.
  if (notes.length === 0) {
    return (
      <div className="text-center py-12 text-amber-mid">
        <FileText className="w-10 h-10 mx-auto mb-3 text-amber-bright opacity-50" />
        <p className="font-medium text-amber-dark">Nenhuma nota clínica</p>
        <p className="text-sm mt-1">
          Notas clínicas são criadas a partir das consultas do paciente.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note.id} className="rounded-lg border border-[#e8dfc8] bg-white p-4 space-y-2">
          <p className="text-xs text-amber-mid">{formatDateTime(note.created_at)}</p>
          <p className="text-sm text-amber-dark whitespace-pre-wrap line-clamp-4">{note.content}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Documentos ──────────────────────────────────────────────────────────

interface DocumentsTabProps {
  patientId: string
  documents: Array<{
    id: string
    file_name: string
    type: string
    file_url: string
    description?: string
    mime_type: string
    created_at: string
  }>
}

function DocumentsTab({ patientId, documents }: DocumentsTabProps) {
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [selectedType, setSelectedType] = React.useState('')

  const filteredDocuments = selectedType
    ? documents.filter((d) => d.type === selectedType)
    : documents

  return (
    <div className="space-y-4">
      {/* Header com botão upload e filtro */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="w-48">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos</SelectItem>
              <SelectItem value="prescription">Receita</SelectItem>
              <SelectItem value="certificate">Atestado</SelectItem>
              <SelectItem value="exam">Exame</SelectItem>
              <SelectItem value="other">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="w-4 h-4" />
          Enviar documento
        </Button>
      </div>

      {/* Lista de documentos */}
      {filteredDocuments.length === 0 ? (
        <div className="text-center py-12 text-amber-mid">
          <Paperclip className="w-10 h-10 mx-auto mb-3 text-amber-bright opacity-50" />
          <p className="font-medium text-amber-dark">Nenhum documento encontrado</p>
          <p className="text-sm mt-1">
            {selectedType
              ? 'Nenhum documento com este tipo. Tente outro filtro ou faça upload.'
              : 'Os documentos enviados para este paciente aparecerão aqui.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              data-testid="document-row"
              className="rounded-lg border border-[#e8dfc8] bg-white p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm text-amber-dark truncate">{doc.file_name}</p>
                <p className="text-xs text-amber-mid mt-0.5">
                  {documentTypeLabels[doc.type] ?? doc.type} · {formatDate(doc.created_at)}
                </p>
                {doc.description && (
                  <p className="text-xs text-amber-mid mt-0.5 truncate">{doc.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadDocument(doc.id, doc.file_name).catch((err: Error) =>
                    toast.error(err.message),
                  )
                }
                className="shrink-0 text-sm text-blue-steel underline underline-offset-2 hover:text-amber-dark transition-colors"
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        patientId={patientId}
      />
    </div>
  )
}

// ─── Skeleton de perfil ───────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-32 rounded-full" />
      </div>
      <Skeleton className="h-10 w-72 rounded-md" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <Skeleton className="h-20 rounded-lg" />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function DoctorPatientProfilePage() {
  const { patientId } = useParams({ strict: false }) as { patientId: string }

  const { data, isLoading, isError } = useQuery(patientProfileQueryOptions(patientId))

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <ProfileSkeleton />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <Link
          to="/doctor/patients"
          className="inline-flex items-center gap-1.5 text-sm text-blue-steel hover:text-amber-dark transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Pacientes
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
          Paciente não encontrado ou erro ao carregar.
        </div>
      </div>
    )
  }

  const { patient, appointments, clinicalNotes, documents } = data

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-amber-mid">
        <Link
          to="/doctor/patients"
          className="hover:text-amber-dark transition-colors"
        >
          Pacientes
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-amber-dark font-medium">{patient.name}</span>
      </nav>

      {/* Cabeçalho do perfil */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-bright/20 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-amber-dark" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-amber-dark font-heading">{patient.name}</h1>
            <p className="text-sm text-amber-mid">{formatPhone(patient.phone)}</p>
          </div>
        </div>
        <StatusBadge status={patient.status} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="appointments">
            Consultas {appointments.length > 0 && `(${appointments.length})`}
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notas {clinicalNotes.length > 0 && `(${clinicalNotes.length})`}
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documentos {documents.length > 0 && `(${documents.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <InfoTab patientId={patientId} patient={patient} />
        </TabsContent>

        <TabsContent value="appointments">
          <AppointmentsTab appointments={appointments} />
        </TabsContent>

        <TabsContent value="notes">
          <NotesTab notes={clinicalNotes} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab patientId={patientId} documents={documents} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
