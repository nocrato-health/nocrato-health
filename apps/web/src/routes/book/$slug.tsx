import * as React from 'react'
import { useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, Clock, CheckCircle2, ChevronLeft, AlertCircle } from 'lucide-react'

import {
  validateTokenQueryOptions,
  availableSlotsQueryOptions,
  useBookAppointment,
} from '@/lib/queries/booking'
import type { Slot, BookResponse, ValidateTokenResponse } from '@/lib/queries/booking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Tipos internos ───────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(isoString: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(isoString))
}

function todayDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
  }).format(new Date())
}

/**
 * Converte data local (YYYY-MM-DD) + horário local (HH:mm) para ISO UTC,
 * usando o timezone do doutor para calcular o offset correto.
 *
 * Estratégia: usa uma referência ao meio-dia UTC da data escolhida para
 * determinar o offset do timezone naquele dia (lida com DST automaticamente),
 * depois aplica esse offset ao horário desejado.
 */
function localToIso(date: string, time: string, timezone: string): string {
  const ref = new Date(`${date}T12:00:00Z`)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(ref)
  const get = (type: string) => (parts.find((p) => p.type === type) ?? { value: '00' }).value
  const localAtRef = new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`,
  )
  const offsetMs = ref.getTime() - localAtRef.getTime()
  const naive = new Date(`${date}T${time}:00Z`)
  return new Date(naive.getTime() + offsetMs).toISOString()
}

// ─── Constante: URL da política de privacidade ────────────────────────────────

const PRIVACY_POLICY_URL = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/v1/politica-de-privacidade`

// ─── Schema do formulário de confirmação ──────────────────────────────────────

const confirmSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  phone: z.string().min(8, 'Telefone inválido'),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Você deve aceitar a Política de Privacidade para continuar.' }),
  }),
})

type ConfirmForm = z.infer<typeof confirmSchema>

// ─── Tela de erro de token ────────────────────────────────────────────────────

function TokenErrorScreen({ reason }: { reason?: string }) {
  let message = 'Link inválido.'

  if (reason === 'expired') {
    message = 'Este link expirou. Solicite um novo link pelo WhatsApp.'
  } else if (reason === 'used') {
    message = 'Este link já foi utilizado.'
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-lg text-center space-y-4">
        <div className="flex justify-center">
          <AlertCircle className="w-14 h-14 text-orange" />
        </div>
        <h1 className="text-2xl font-bold text-amber-dark font-heading">
          Link não disponível
        </h1>
        <p className="text-amber-mid text-base leading-relaxed">{message}</p>
      </div>
    </div>
  )
}

// ─── Header da clínica ────────────────────────────────────────────────────────

interface ClinicHeaderProps {
  validateData: ValidateTokenResponse
}

function ClinicHeader({ validateData }: ClinicHeaderProps) {
  return (
    <div className="text-center space-y-1 pb-4 border-b border-[#e8dfc8]">
      {validateData.tenant?.logoUrl && (
        <img
          src={validateData.tenant.logoUrl}
          alt={validateData.tenant.name}
          className="h-12 mx-auto mb-2 object-contain"
        />
      )}
      <p className="text-xs uppercase tracking-widest text-blue-steel font-semibold">
        Agendamento online
      </p>
      {validateData.tenant?.name && (
        <h1 className="text-xl font-bold text-amber-dark font-heading">
          {validateData.tenant.name}
        </h1>
      )}
      {validateData.doctor?.name && (
        <p className="text-sm text-amber-mid">
          {validateData.doctor.name}
          {validateData.doctor.specialty ? ` · ${validateData.doctor.specialty}` : ''}
        </p>
      )}
    </div>
  )
}

// ─── Step 1 — Seleção de data ─────────────────────────────────────────────────

interface Step1Props {
  readonly selectedDate: string
  readonly onDateChange: (date: string) => void
  readonly onNext: () => void
  readonly validateData: ValidateTokenResponse
  readonly timezone: string
}

function Step1DatePicker({ selectedDate, onDateChange, onNext, validateData, timezone }: Step1Props) {
  return (
    <div className="space-y-6">
      <ClinicHeader validateData={validateData} />

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-amber-dark">
          <CalendarDays className="w-5 h-5" />
          <h2 className="text-lg font-semibold font-heading">Escolha uma data</h2>
        </div>
        <p className="text-sm text-amber-mid">
          Selecione a data desejada para ver os horários disponíveis.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="date-input" className="text-amber-dark font-medium">
          Data da consulta
        </Label>
        <Input
          id="date-input"
          type="date"
          min={todayDate(timezone)}
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="border-[#e8dfc8] focus:border-amber-bright"
        />
      </div>

      <Button
        className="w-full"
        disabled={!selectedDate}
        onClick={onNext}
      >
        Ver horários disponíveis
      </Button>
    </div>
  )
}

// ─── Step 2 — Seleção de horário ──────────────────────────────────────────────

interface Step2Props {
  readonly slug: string
  readonly token: string
  readonly selectedDate: string
  readonly onSlotSelect: (slot: Slot) => void
  readonly onBack: () => void
  readonly validateData: ValidateTokenResponse
  readonly timezone: string
}

function Step2SlotPicker({ slug, token, selectedDate, onSlotSelect, onBack, validateData, timezone }: Step2Props) {
  const { data: slotsData, isLoading, isError } = useQuery(
    availableSlotsQueryOptions(slug, token, selectedDate),
  )

  const effectiveTimezone = slotsData?.timezone ?? timezone

  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: effectiveTimezone,
  }).format(new Date(`${selectedDate}T12:00:00Z`))

  return (
    <div className="space-y-6">
      <ClinicHeader validateData={validateData} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-blue-steel hover:text-amber-dark transition-colors"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2 text-amber-dark">
            <Clock className="w-5 h-5" />
            <h2 className="text-lg font-semibold font-heading capitalize">{formattedDate}</h2>
          </div>
          <p className="text-sm text-amber-mid ml-7">Selecione um horário</p>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-md" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 text-center">
          Erro ao carregar horários. Tente novamente.
        </div>
      )}

      {!isLoading && !isError && slotsData && slotsData.slots.length === 0 && (
        <div className="rounded-xl border border-[#e8dfc8] bg-white p-8 text-center space-y-2">
          <Clock className="w-8 h-8 text-amber-bright mx-auto opacity-50" />
          <p className="text-amber-dark font-medium text-sm">
            Nenhum horário disponível nesta data.
          </p>
          <p className="text-xs text-amber-mid">
            Tente outro dia.
          </p>
          <Button variant="outline" size="sm" onClick={onBack} className="mt-2">
            Escolher outra data
          </Button>
        </div>
      )}

      {!isLoading && !isError && slotsData && slotsData.slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {slotsData.slots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              onClick={() => onSlotSelect(slot)}
              className="h-11 rounded-md border border-[#e8dfc8] bg-white text-sm font-medium text-amber-dark hover:border-amber-bright hover:bg-amber-bright/10 transition-all focus:outline-none focus:ring-2 focus:ring-amber-bright focus:ring-offset-1"
            >
              {slot.start}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 3 — Formulário de confirmação ──────────────────────────────────────

interface Step3Props {
  slug: string
  token: string
  selectedSlot: Slot
  selectedDate: string
  prefillPhone?: string
  onBack: () => void
  onSuccess: (data: BookResponse) => void
  onConflict: () => void
  validateData: ValidateTokenResponse
  timezone: string
}

function Step3ConfirmForm({
  slug,
  token,
  selectedSlot,
  selectedDate,
  prefillPhone,
  onBack,
  onSuccess,
  onConflict,
  validateData,
  timezone,
}: Step3Props) {
  const bookAppointment = useBookAppointment()
  const [mutationError, setMutationError] = React.useState<string | null>(null)

  const isPhonePrefilled = !!prefillPhone

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmForm>({
    resolver: zodResolver(confirmSchema),
    defaultValues: {
      phone: prefillPhone ?? '',
      consentAccepted: undefined,
    },
  })

  const consentChecked = watch('consentAccepted')

  function onSubmit(data: ConfirmForm) {
    setMutationError(null)
    bookAppointment.mutate(
      {
        slug,
        token,
        name: data.name,
        phone: data.phone,
        dateTime: localToIso(selectedDate, selectedSlot.start, timezone),
        consentAccepted: data.consentAccepted,
      },
      {
        onSuccess: (result) => {
          onSuccess(result)
        },
        onError: (err: Error & { status?: number; data?: { code?: string; message?: string } }) => {
          if (err.status === 409 || err.data?.code === 'SLOT_CONFLICT') {
            onConflict()
          } else {
            setMutationError(
              err.data?.message ?? 'Erro ao confirmar agendamento. Tente novamente.',
            )
          }
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <ClinicHeader validateData={validateData} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-blue-steel hover:text-amber-dark transition-colors"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold font-heading text-amber-dark">
            Confirmar agendamento
          </h2>
          <p className="text-sm text-amber-mid">
            {selectedSlot.start} — preencha seus dados
          </p>
        </div>
      </div>

      {mutationError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {mutationError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="confirm-name" className="text-amber-dark font-medium">
            Nome completo *
          </Label>
          <Input
            id="confirm-name"
            placeholder="Seu nome completo"
            {...register('name')}
            error={!!errors.name}
          />
          {errors.name && (
            <p className="text-xs text-red-500">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-phone" className="text-amber-dark font-medium">
            Telefone *
          </Label>
          <Input
            id="confirm-phone"
            type="tel"
            placeholder="(11) 99999-9999"
            readOnly={isPhonePrefilled}
            className={isPhonePrefilled ? 'bg-[#f5f0e8] cursor-not-allowed' : ''}
            {...register('phone')}
            error={!!errors.phone}
          />
          {isPhonePrefilled && (
            <p className="text-xs text-amber-mid">Telefone confirmado pelo WhatsApp.</p>
          )}
          {errors.phone && (
            <p className="text-xs text-red-500">{errors.phone.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              {...register('consentAccepted', { setValueAs: (v) => v === true || v === 'true' ? true as const : undefined as unknown as true })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#e8dfc8] accent-amber-500 cursor-pointer"
            />
            <span className="text-sm text-amber-mid leading-snug">
              Li e aceito a{' '}
              <a
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-steel underline underline-offset-2 hover:text-amber-dark transition-colors"
              >
                Política de Privacidade
              </a>
            </span>
          </label>
          {errors.consentAccepted && (
            <p className="text-xs text-red-500">{errors.consentAccepted.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={!consentChecked}
          loading={isSubmitting || bookAppointment.isPending}
        >
          Confirmar agendamento
        </Button>
      </form>
    </div>
  )
}

// ─── Step 4 — Tela de sucesso ─────────────────────────────────────────────────

interface Step4Props {
  readonly bookResult: BookResponse
  readonly timezone: string
}

function Step4Success({ bookResult, timezone }: Step4Props) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-amber-bright/20 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-amber-dark" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-amber-dark font-heading">
          Consulta agendada!
        </h2>
        <p className="text-amber-mid text-sm leading-relaxed">
          Você receberá confirmação no WhatsApp.
        </p>
      </div>

      <div className="rounded-xl border border-[#e8dfc8] bg-white p-5 text-left space-y-3">
        <div className="flex items-start gap-3">
          <CalendarDays className="w-5 h-5 text-blue-steel mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-amber-mid uppercase tracking-wide font-semibold mb-0.5">
              Data e hora
            </p>
            <p className="text-sm font-semibold text-amber-dark">
              {formatDateTime(bookResult.appointment.dateTime, timezone)}
            </p>
          </div>
        </div>

        <div className="border-t border-[#e8dfc8]" />

        <div className="flex items-start gap-3">
          <div className="w-5 h-5 mt-0.5 flex-shrink-0 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-amber-bright" />
          </div>
          <div>
            <p className="text-xs text-amber-mid uppercase tracking-wide font-semibold mb-0.5">
              Médico
            </p>
            <p className="text-sm font-semibold text-amber-dark">
              {bookResult.doctor.name}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton da página (carregando validação) ────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pb-4 border-b border-[#e8dfc8]">
        <Skeleton className="h-3 w-32 mx-auto" />
        <Skeleton className="h-6 w-48 mx-auto" />
        <Skeleton className="h-4 w-36 mx-auto" />
      </div>
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

// ─── Componente principal da página ──────────────────────────────────────────

export function BookingPage() {
  const { slug } = useParams({ strict: false }) as { slug: string }
  const search = useSearch({ strict: false }) as { token?: string }
  const token = search.token ?? ''

  const [step, setStep] = React.useState<Step>(1)
  const [selectedDate, setSelectedDate] = React.useState('')
  const [selectedSlot, setSelectedSlot] = React.useState<Slot | null>(null)
  const [bookResult, setBookResult] = React.useState<BookResponse | null>(null)

  const {
    data: validateData,
    isLoading: isValidating,
    isError: isValidateError,
    error: validateError,
  } = useQuery(validateTokenQueryOptions(slug ?? '', token))

  React.useEffect(() => {
    const doctorName = validateData?.doctor?.name
    if (doctorName) {
      document.title = `Agendar consulta — ${doctorName}`
    } else {
      document.title = 'Agendar consulta — Nocrato'
    }
  }, [validateData?.doctor?.name])

  // Sem token na URL → erro imediato
  if (!token) {
    return <TokenErrorScreen />
  }

  // Guard de runtime: slug pode ser undefined se useParams(strict:false) não fizer match
  if (!slug) {
    return <TokenErrorScreen />
  }

  // Carregando validação
  if (isValidating) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <PageSkeleton />
        </div>
      </div>
    )
  }

  // Erro de rede ao validar
  if (isValidateError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reason = (validateError as any)?.data?.reason as ValidateTokenResponse['reason']
    return <TokenErrorScreen reason={reason} />
  }

  // Token inválido ou expirado
  if (!validateData || !validateData.valid) {
    return <TokenErrorScreen reason={validateData?.reason} />
  }

  // Timezone do doutor — fallback para UTC se o campo ainda não vier do backend
  const doctorTimezone = validateData.doctor?.timezone ?? 'UTC'

  function handleDateSelected(date: string) {
    setSelectedDate(date)
  }

  function handleGoToSlots() {
    setStep(2)
  }

  function handleSlotSelected(slot: Slot) {
    setSelectedSlot(slot)
    setStep(3)
  }

  function handleBookSuccess(result: BookResponse) {
    setBookResult(result)
    setStep(4)
  }

  function handleConflict() {
    // Volta para step 2 — o usuário escolhe outro slot
    setSelectedSlot(null)
    setStep(2)
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl border border-[#e8dfc8] shadow-sm p-6 space-y-0">
          {step === 1 && (
            <Step1DatePicker
              selectedDate={selectedDate}
              onDateChange={handleDateSelected}
              onNext={handleGoToSlots}
              validateData={validateData}
              timezone={doctorTimezone}
            />
          )}

          {step === 2 && (
            <Step2SlotPicker
              slug={slug}
              token={token}
              selectedDate={selectedDate}
              onSlotSelect={handleSlotSelected}
              onBack={() => setStep(1)}
              validateData={validateData}
              timezone={doctorTimezone}
            />
          )}

          {step === 3 && selectedSlot && (
            <Step3ConfirmForm
              slug={slug}
              token={token}
              selectedSlot={selectedSlot}
              selectedDate={selectedDate}
              prefillPhone={validateData.phone}
              onBack={() => setStep(2)}
              onSuccess={handleBookSuccess}
              onConflict={handleConflict}
              validateData={validateData}
              timezone={doctorTimezone}
            />
          )}

          {step === 4 && bookResult && (
            <Step4Success bookResult={bookResult} timezone={doctorTimezone} />
          )}
        </div>
      </div>
    </div>
  )
}
