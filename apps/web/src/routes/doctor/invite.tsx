import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect, useRef } from 'react'
import { useSearch, useNavigate, Link } from '@tanstack/react-router'
import { api } from '@/lib/api-client'
import { useAuthStore } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { DoctorLoginResponse, DoctorInviteValidation } from '@/types/api'

const schema = z
  .object({
    name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
    slug: z
      .string()
      .min(3, 'URL deve ter ao menos 3 caracteres')
      .max(50, 'URL muito longa')
      .regex(/^[a-z0-9-]+$/, 'Apenas letras minúsculas, números e hífens (ex: dr-silva)'),
    password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

export function DoctorInvitePage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const search = useSearch({ strict: false }) as { token?: string }
  const token = search.token

  const [inviteData, setInviteData] = useState<DoctorInviteValidation | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  // Impede sugestão de slug após o usuário editar manualmente
  const slugEditedManually = useRef(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const nameValue = watch('name')

  // Validar token ao montar
  useEffect(() => {
    if (!token) {
      setTokenError('Link de convite inválido ou expirado.')
      return
    }

    api
      .get<DoctorInviteValidation>(`/api/v1/doctor/auth/invite/${token}`)
      .then((data) => {
        setInviteData(data)
        if (data.name) setValue('name', data.name)
      })
      .catch(() => {
        setTokenError('Link de convite inválido ou expirado. Solicite um novo convite.')
      })
  }, [token, setValue])

  // Sugestão automática de slug com base no nome — só enquanto o usuário não editar manualmente
  useEffect(() => {
    if (!nameValue || slugEditedManually.current) return
    const suggested = nameValue
      .toLowerCase()
      .normalize('NFD')
      .replaceAll(/[\u0300-\u036f]/g, '')
      .replaceAll(/[^a-z0-9\s-]/g, '')
      .trim()
      .replaceAll(/\s+/g, '-')
    setValue('slug', suggested, { shouldValidate: false })
  }, [nameValue, setValue])

  async function onSubmit(data: FormData) {
    setServerError(null)
    try {
      const res = await api.post<DoctorLoginResponse>('/api/v1/doctor/auth/accept-invite', {
        token,
        name: data.name,
        slug: data.slug,
        password: data.password,
      })
      setAuth({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.doctor,
        userType: 'doctor',
        tenantId: res.doctor.tenantId,
        onboardingCompleted: res.doctor.onboardingCompleted,
      })
      await navigate({ to: '/doctor/dashboard' })
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Erro ao aceitar convite')
    }
  }

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-amber-dark font-heading">Nocrato Health</h1>
            <p className="text-sm text-gray-500 mt-1">Portal do Médico</p>
          </div>
          <Alert variant="destructive">
            <AlertDescription>{tokenError}</AlertDescription>
          </Alert>
          <div className="text-center">
            <Link to="/doctor/login" className="text-xs text-blue-steel hover:underline">
              Ir para o login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!inviteData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div>
            <h1 className="text-3xl font-bold text-amber-dark font-heading">Nocrato Health</h1>
            <p className="text-sm text-gray-500 mt-1">Portal do Médico</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Validando convite...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-amber-dark font-heading">Nocrato Health</h1>
          <p className="text-sm text-gray-500 mt-1">Bem-vindo à plataforma</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configure sua conta</CardTitle>
            <CardDescription>
              Convite para <span className="font-medium">{inviteData.email}</span>. Complete o
              cadastro para acessar seu portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {serverError && (
                <Alert variant="destructive">
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="name">Seu nome completo</Label>
                <Input
                  id="name"
                  placeholder="Dr. João Silva"
                  error={!!errors.name}
                  {...register('name')}
                />
                {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug">
                  URL do seu portal{' '}
                  <span className="text-gray-400 font-normal text-xs">(identificador único)</span>
                </Label>
                <div
                  className={`flex items-center rounded-md border bg-white overflow-hidden focus-within:ring-2 focus-within:ring-amber-bright focus-within:ring-offset-1 ${errors.slug ? 'border-red-500' : 'border-blue-steel/40'}`}
                >
                  <span className="px-3 text-xs text-gray-400 whitespace-nowrap border-r border-blue-steel/20 bg-gray-50 h-10 flex items-center select-none">
                    nocrato.com/
                  </span>
                  <input
                    id="slug"
                    placeholder="dr-silva"
                    className="flex-1 h-10 px-3 text-sm bg-white outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                    {...register('slug', {
                      onChange: () => {
                        slugEditedManually.current = true
                      },
                    })}
                  />
                </div>
                {errors.slug && <p className="text-xs text-red-600">{errors.slug.message}</p>}
                <p className="text-xs text-gray-400">
                  Apenas letras minúsculas, números e hífens.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  error={!!errors.password}
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  error={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-red-600">{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" loading={isSubmitting}>
                Criar minha conta
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
