import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/lib/auth'
import {
  useUpdateProfile,
  useUpdateSchedule,
  useUpdateBranding,
  useUpdateAgent,
  useCompleteOnboarding,
  type UpdateProfilePayload,
  type UpdateSchedulePayload,
  type UpdateBrandingPayload,
  type UpdateAgentPayload,
} from '@/lib/queries/doctor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatPhone } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const TIMEZONE_OPTIONS = [
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (GMT-5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (GMT-2)' },
  { value: 'America/Belem', label: 'Belém / Fortaleza (GMT-3)' },
]

const APPOINTMENT_DURATION_OPTIONS = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 45, label: '45 minutos' },
  { value: 60, label: '1 hora' },
]

const WEEKDAYS = [
  { key: 'monday', label: 'Segunda-feira' },
  { key: 'tuesday', label: 'Terça-feira' },
  { key: 'wednesday', label: 'Quarta-feira' },
  { key: 'thursday', label: 'Quinta-feira' },
  { key: 'friday', label: 'Sexta-feira' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
] as const

type WeekdayKey = typeof WEEKDAYS[number]['key']

const TOTAL_STEPS = 4

// ─── Schemas ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(3, 'Nome deve ter ao menos 3 caracteres'),
  crm: z.string().min(3, 'CRM deve ter ao menos 3 caracteres'),
  crmState: z.enum(UF_OPTIONS as [string, ...string[]], {
    errorMap: () => ({ message: 'Selecione um estado' }),
  }),
  specialty: z.string().optional(),
  phone: z.string().optional(),
})

type ProfileFormData = z.infer<typeof profileSchema>

const scheduleSchema = z.object({
  timezone: z.string().min(1, 'Selecione um fuso horário'),
  appointmentDuration: z.coerce.number().min(1, 'Selecione a duração'),
})

type ScheduleFormData = z.infer<typeof scheduleSchema>

const brandingSchema = z.object({
  primaryColor: z.string().optional(),
  logoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
})

type BrandingFormData = z.infer<typeof brandingSchema>

const agentSchema = z.object({
  welcomeMessage: z.string().min(10, 'Mensagem de boas-vindas deve ter ao menos 10 caracteres'),
  personality: z.string().optional(),
})

type AgentFormData = z.infer<typeof agentSchema>

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const progress = (step / TOTAL_STEPS) * 100

  const stepLabels = ['Perfil', 'Horários', 'Branding', 'Agente']

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-[#af830d]">
        <span>
          Passo {step} de {TOTAL_STEPS}
        </span>
        <span className="font-medium text-amber-dark">{Math.round(progress)}% concluído</span>
      </div>
      <div className="w-full h-2 bg-[#f5f0e8] rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-bright rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between">
        {stepLabels.map((label, i) => {
          const stepNum = i + 1
          const isCompleted = stepNum < step
          const isCurrent = stepNum === step
          return (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className={[
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                  isCompleted
                    ? 'bg-amber-bright text-amber-dark'
                    : isCurrent
                      ? 'bg-amber-bright/30 text-amber-dark border-2 border-amber-bright'
                      : 'bg-[#f5f0e8] text-[#af830d]',
                ].join(' ')}
              >
                {isCompleted ? '✓' : stepNum}
              </div>
              <span
                className={[
                  'text-xs hidden sm:block',
                  isCurrent ? 'text-amber-dark font-medium' : 'text-[#af830d]',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 1 — Perfil ─────────────────────────────────────────────────────────

interface Step1Props {
  onNext: (data: UpdateProfilePayload) => Promise<void>
  isLoading: boolean
  serverError: string | null
}

function Step1Profile({ onNext, isLoading, serverError }: Step1Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ProfileFormData>({ resolver: zodResolver(profileSchema) })

  async function onSubmit(data: ProfileFormData) {
    await onNext({
      name: data.name,
      crm: data.crm,
      crmState: data.crmState,
      specialty: data.specialty || undefined,
      phone: data.phone || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="name">
            Nome completo <span className="text-red-600">*</span>
          </Label>
          <Input
            id="name"
            placeholder="Dr. João Silva"
            error={!!errors.name}
            {...register('name')}
          />
          {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="crm">
            CRM <span className="text-red-600">*</span>
          </Label>
          <Input
            id="crm"
            placeholder="123456"
            error={!!errors.crm}
            {...register('crm')}
          />
          {errors.crm && <p className="text-xs text-red-600">{errors.crm.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="crmState">
            Estado do CRM <span className="text-red-600">*</span>
          </Label>
          <Select value={watch('crmState') || ''} onValueChange={(val) => setValue('crmState', val)}>
            <SelectTrigger className={errors.crmState ? 'border-red-500' : ''}>
              <SelectValue placeholder="Selecione o estado" />
            </SelectTrigger>
            <SelectContent>
              {UF_OPTIONS.map((uf) => (
                <SelectItem key={uf} value={uf}>{uf}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.crmState && (
            <p className="text-xs text-red-600">{errors.crmState.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="specialty">
            Especialidade{' '}
            <span className="text-[#af830d] font-normal text-xs">(opcional)</span>
          </Label>
          <Input
            id="specialty"
            placeholder="Cardiologia"
            {...register('specialty')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">
            Telefone{' '}
            <span className="text-[#af830d] font-normal text-xs">(opcional)</span>
          </Label>
          <Input
            id="phone"
            placeholder="(11) 99999-9999"
            value={watch('phone') ?? ''}
            onChange={(e) => setValue('phone', formatPhone(e.target.value))}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" loading={isLoading}>
          Próximo
        </Button>
      </div>
    </form>
  )
}

// ─── Step 2 — Horários ───────────────────────────────────────────────────────

interface WorkingHoursState {
  enabled: boolean
  start: string
  end: string
}

interface Step2Props {
  onNext: (data: UpdateSchedulePayload) => Promise<void>
  onBack: () => void
  isLoading: boolean
  serverError: string | null
}

function Step2Schedule({ onNext, onBack, isLoading, serverError }: Step2Props) {
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const defaultTimezone = TIMEZONE_OPTIONS.some(o => o.value === browserTimezone)
    ? browserTimezone
    : 'America/Sao_Paulo'

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      timezone: defaultTimezone,
      appointmentDuration: 30,
    },
  })

  const [weekdayState, setWeekdayState] = useState<Record<WeekdayKey, WorkingHoursState>>({
    monday: { enabled: true, start: '08:00', end: '17:00' },
    tuesday: { enabled: true, start: '08:00', end: '17:00' },
    wednesday: { enabled: true, start: '08:00', end: '17:00' },
    thursday: { enabled: true, start: '08:00', end: '17:00' },
    friday: { enabled: true, start: '08:00', end: '17:00' },
    saturday: { enabled: false, start: '08:00', end: '12:00' },
    sunday: { enabled: false, start: '08:00', end: '12:00' },
  })
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  function toggleDay(day: WeekdayKey) {
    setWeekdayState((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }))
  }

  function updateDayTime(day: WeekdayKey, field: 'start' | 'end', value: string) {
    setWeekdayState((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }))
  }

  async function onSubmit(formData: ScheduleFormData) {
    setScheduleError(null)

    const enabledDays = WEEKDAYS.filter((d) => weekdayState[d.key].enabled)
    if (enabledDays.length === 0) {
      setScheduleError('Selecione ao menos um dia de atendimento.')
      return
    }

    const workingHours: UpdateSchedulePayload['workingHours'] = {}
    for (const { key } of enabledDays) {
      const { start, end } = weekdayState[key]
      workingHours[key] = [{ start, end }]
    }

    await onNext({
      workingHours,
      timezone: formData.timezone,
      appointmentDuration: Number(formData.appointmentDuration),
    })
  }

  const selectClass = [
    'flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
    'border-blue-steel/40 focus-visible:ring-amber-bright',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' ')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {(serverError || scheduleError) && (
        <Alert variant="destructive">
          <AlertDescription>{serverError ?? scheduleError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        <Label>Dias e horários de atendimento</Label>
        <div className="rounded-lg border border-[#e8dfc8] divide-y divide-[#f5f0e8]">
          {WEEKDAYS.map(({ key, label }) => {
            const state = weekdayState[key]
            return (
              <div key={key} className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  id={`day-${key}`}
                  checked={state.enabled}
                  onChange={() => toggleDay(key)}
                  className="w-4 h-4 rounded accent-amber-bright cursor-pointer"
                />
                <label
                  htmlFor={`day-${key}`}
                  className="w-32 text-sm font-medium text-amber-dark cursor-pointer select-none"
                >
                  {label}
                </label>
                {state.enabled ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={state.start}
                      onChange={(e) => updateDayTime(key, 'start', e.target.value)}
                      className="h-8 rounded border border-blue-steel/40 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-bright bg-white"
                    />
                    <span className="text-[#af830d] text-sm">até</span>
                    <input
                      type="time"
                      value={state.end}
                      onChange={(e) => updateDayTime(key, 'end', e.target.value)}
                      className="h-8 rounded border border-blue-steel/40 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-bright bg-white"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-[#af830d] italic">Sem atendimento</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="timezone">
            Fuso horário <span className="text-red-600">*</span>
          </Label>
          <Select value={watch('timezone') || ''} onValueChange={(val) => setValue('timezone', val)}>
            <SelectTrigger className={errors.timezone ? 'border-red-500' : ''}>
              <SelectValue placeholder="Selecione o fuso" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.timezone && (
            <p className="text-xs text-red-600">{errors.timezone.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="appointmentDuration">
            Duração padrão da consulta <span className="text-red-600">*</span>
          </Label>
          <Select
            value={watch('appointmentDuration')?.toString() || '30'}
            onValueChange={(val) => setValue('appointmentDuration', parseInt(val))}
          >
            <SelectTrigger className={errors.appointmentDuration ? 'border-red-500' : ''}>
              <SelectValue placeholder="Duração" />
            </SelectTrigger>
            <SelectContent>
              {APPOINTMENT_DURATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value.toString()}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.appointmentDuration && (
            <p className="text-xs text-red-600">{errors.appointmentDuration.message}</p>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          className="border-[#af830d] text-amber-dark hover:bg-[#fef9e6] hover:text-amber-dark"
          onClick={onBack}
        >
          Voltar
        </Button>
        <Button type="submit" loading={isLoading}>
          Próximo
        </Button>
      </div>
    </form>
  )
}

// ─── Step 3 — Branding ───────────────────────────────────────────────────────

interface Step3Props {
  onNext: (data: UpdateBrandingPayload) => Promise<void>
  onBack: () => void
  isLoading: boolean
  serverError: string | null
}

function Step3Branding({ onNext, onBack, isLoading, serverError }: Step3Props) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
    defaultValues: { primaryColor: '#fabe01', logoUrl: '' },
  })

  const primaryColor = watch('primaryColor')

  async function onSubmit(data: BrandingFormData) {
    await onNext({
      primaryColor: data.primaryColor || undefined,
      logoUrl: data.logoUrl || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-blue-steel/20 bg-blue-steel/5 px-4 py-3 text-sm text-blue-steel">
        Esta etapa é opcional — você pode avançar sem preencher nada e personalizar o branding
        depois nas configurações do portal.
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="primaryColor">
          Cor principal do portal{' '}
          <span className="text-[#af830d] font-normal text-xs">(opcional)</span>
        </Label>
        <div className="flex items-center gap-3">
          <input
            id="primaryColor"
            type="color"
            className="h-10 w-16 rounded-md border border-blue-steel/40 cursor-pointer p-1 bg-white"
            {...register('primaryColor')}
          />
          <Input
            value={primaryColor ?? ''}
            onChange={(e) => setValue('primaryColor', e.target.value)}
            placeholder="#fabe01"
            className="w-36"
          />
          <span className="text-xs text-[#af830d]">Formato hexadecimal (ex: #fabe01)</span>
        </div>
        {errors.primaryColor && (
          <p className="text-xs text-red-600">{errors.primaryColor.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="logoUrl">
          URL do logotipo{' '}
          <span className="text-[#af830d] font-normal text-xs">(opcional)</span>
        </Label>
        <Input
          id="logoUrl"
          placeholder="https://exemplo.com/logo.png"
          error={!!errors.logoUrl}
          {...register('logoUrl')}
        />
        {errors.logoUrl && (
          <p className="text-xs text-red-600">{errors.logoUrl.message}</p>
        )}
        <p className="text-xs text-[#af830d]">
          Informe a URL pública da imagem do seu logotipo. Upload de arquivo disponível em breve.
        </p>
      </div>

      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          className="border-[#af830d] text-amber-dark hover:bg-[#fef9e6] hover:text-amber-dark"
          onClick={onBack}
        >
          Voltar
        </Button>
        <Button type="submit" loading={isLoading}>
          Próximo
        </Button>
      </div>
    </form>
  )
}

// ─── Step 4 — Agente ─────────────────────────────────────────────────────────

interface Step4Props {
  onFinish: (data: UpdateAgentPayload) => Promise<void>
  onBack: () => void
  isLoading: boolean
  serverError: string | null
}

function Step4Agent({ onFinish, onBack, isLoading, serverError }: Step4Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AgentFormData>({ resolver: zodResolver(agentSchema) })

  async function onSubmit(data: AgentFormData) {
    await onFinish({
      welcomeMessage: data.welcomeMessage,
      personality: data.personality || undefined,
    })
  }

  const textareaClass = [
    'flex w-full rounded-md border bg-white px-3 py-2 text-sm',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
    'disabled:cursor-not-allowed disabled:opacity-50 resize-none',
    'border-blue-steel/40 focus-visible:ring-amber-bright placeholder:text-[#af830d]/50',
  ].join(' ')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="welcomeMessage">
          Mensagem de boas-vindas <span className="text-red-600">*</span>
        </Label>
        <textarea
          id="welcomeMessage"
          rows={4}
          placeholder="Olá! Sou o assistente do Dr. João Silva. Como posso ajudar você hoje?"
          className={[
            textareaClass,
            errors.welcomeMessage ? 'border-red-500 focus-visible:ring-red-500' : '',
          ].join(' ')}
          {...register('welcomeMessage')}
        />
        {errors.welcomeMessage && (
          <p className="text-xs text-red-600">{errors.welcomeMessage.message}</p>
        )}
        <p className="text-xs text-[#af830d]">
          Esta mensagem será enviada automaticamente quando um paciente iniciar uma conversa no
          WhatsApp.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="personality">
          Personalidade do agente{' '}
          <span className="text-[#af830d] font-normal text-xs">(opcional)</span>
        </Label>
        <textarea
          id="personality"
          rows={3}
          placeholder="Seja empático, objetivo e sempre encerre com 'Posso ajudar com mais alguma coisa?'"
          className={textareaClass}
          {...register('personality')}
        />
        <p className="text-xs text-[#af830d]">
          Descreva o tom e estilo de comunicação desejado para o agente.
        </p>
      </div>

      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          className="border-[#af830d] text-amber-dark hover:bg-[#fef9e6] hover:text-amber-dark"
          onClick={onBack}
        >
          Voltar
        </Button>
        <Button type="submit" loading={isLoading}>
          Concluir configuração
        </Button>
      </div>
    </form>
  )
}

// ─── Wizard principal ─────────────────────────────────────────────────────────

const STEP_TITLES = [
  { title: 'Perfil profissional', description: 'Informe seus dados de identificação médica' },
  { title: 'Horários de atendimento', description: 'Configure os dias e horários do seu consultório' },
  { title: 'Identidade visual', description: 'Personalize as cores e logo do seu portal' },
  { title: 'Configuração do agente', description: 'Configure o assistente WhatsApp do seu consultório' },
]

export function DoctorOnboardingPage() {
  const navigate = useNavigate()
  const { setOnboardingCompleted } = useAuthStore()

  const [currentStep, setCurrentStep] = useState(1)
  const [serverError, setServerError] = useState<string | null>(null)

  const updateProfile = useUpdateProfile()
  const updateSchedule = useUpdateSchedule()
  const updateBranding = useUpdateBranding()
  const updateAgent = useUpdateAgent()
  const completeOnboarding = useCompleteOnboarding()

  const isLoading =
    updateProfile.isPending ||
    updateSchedule.isPending ||
    updateBranding.isPending ||
    updateAgent.isPending ||
    completeOnboarding.isPending

  async function handleStep1(data: UpdateProfilePayload) {
    setServerError(null)
    try {
      await updateProfile.mutateAsync(data)
      setCurrentStep(2)
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Erro ao salvar perfil')
    }
  }

  async function handleStep2(data: UpdateSchedulePayload) {
    setServerError(null)
    try {
      await updateSchedule.mutateAsync(data)
      setCurrentStep(3)
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Erro ao salvar horários')
    }
  }

  async function handleStep3(data: UpdateBrandingPayload) {
    setServerError(null)
    try {
      await updateBranding.mutateAsync(data)
      setCurrentStep(4)
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Erro ao salvar branding')
    }
  }

  async function handleStep4(data: UpdateAgentPayload) {
    setServerError(null)
    try {
      await updateAgent.mutateAsync(data)
      await completeOnboarding.mutateAsync()
      setOnboardingCompleted(true)
      await navigate({ to: '/doctor/dashboard' })
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Erro ao concluir configuração')
    }
  }

  const { title, description } = STEP_TITLES[currentStep - 1]

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-amber-dark font-heading">Nocrato Health</h1>
          <p className="text-sm text-[#af830d] mt-1">Configure seu portal médico</p>
        </div>

        {/* Progress */}
        <ProgressBar step={currentStep} />

        {/* Card */}
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentStep === 1 && (
              <Step1Profile
                onNext={handleStep1}
                isLoading={updateProfile.isPending}
                serverError={serverError}
              />
            )}
            {currentStep === 2 && (
              <Step2Schedule
                onNext={handleStep2}
                onBack={() => { setCurrentStep(1); setServerError(null) }}
                isLoading={updateSchedule.isPending}
                serverError={serverError}
              />
            )}
            {currentStep === 3 && (
              <Step3Branding
                onNext={handleStep3}
                onBack={() => { setCurrentStep(2); setServerError(null) }}
                isLoading={updateBranding.isPending}
                serverError={serverError}
              />
            )}
            {currentStep === 4 && (
              <Step4Agent
                onFinish={handleStep4}
                onBack={() => { setCurrentStep(3); setServerError(null) }}
                isLoading={isLoading}
                serverError={serverError}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
