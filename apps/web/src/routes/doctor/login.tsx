import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { api } from '@/lib/api-client'
import { useAuthStore } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { DoctorLoginResponse, DoctorResolveEmailResponse } from '@/types/api'

// Passo 1: apenas email
const emailSchema = z.object({
  email: z.string().email('Email inválido'),
})

// Passo 2: senha (email já resolvido)
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Senha obrigatória'),
})

type EmailData = z.infer<typeof emailSchema>
type LoginData = z.infer<typeof loginSchema>

type Step = 'email' | 'password'

export function DoctorLoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const [step, setStep] = useState<Step>('email')
  const [resolvedEmail, setResolvedEmail] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)

  const emailForm = useForm<EmailData>({ resolver: zodResolver(emailSchema) })
  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '' },
  })

  // Passo 1: resolve se email existe
  async function onEmailSubmit(data: EmailData) {
    setServerError(null)
    try {
      const res = await api.post<DoctorResolveEmailResponse>(
        '/api/v1/doctor/auth/resolve-email',
        { email: data.email },
      )

      if ('hasPendingInvite' in res && res.hasPendingInvite) {
        setServerError(
          'Você tem um convite pendente. Verifique seu email para aceitar o convite.',
        )
        return
      }

      // Sucesso: res é { slug, name } — doutor existe e pode fazer login
      setResolvedEmail(data.email)
      loginForm.setValue('email', data.email)
      setStep('password')
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Erro ao verificar email')
    }
  }

  // Passo 2: login com senha
  async function onLoginSubmit(data: LoginData) {
    setServerError(null)
    try {
      const res = await api.post<DoctorLoginResponse>('/api/v1/doctor/auth/login', {
        email: data.email,
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
      setServerError(err instanceof Error ? err.message : 'Email ou senha incorretos')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-amber-dark font-heading">Nocrato Health</h1>
          <p className="text-sm text-gray-500 mt-1">Portal do Médico</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>
              {step === 'email'
                ? 'Informe seu email para continuar'
                : `Continue como ${resolvedEmail}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'email' ? (
              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                {serverError && (
                  <Alert variant="destructive">
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="doutor@exemplo.com"
                    error={!!emailForm.formState.errors.email}
                    {...emailForm.register('email')}
                  />
                  {emailForm.formState.errors.email && (
                    <p className="text-xs text-red-600">
                      {emailForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  loading={emailForm.formState.isSubmitting}
                >
                  Continuar
                </Button>
              </form>
            ) : (
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                {serverError && (
                  <Alert variant="destructive">
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                )}

                {/* Email readonly — identificação do usuário */}
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={resolvedEmail} readOnly className="bg-gray-50 text-gray-500" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <Link
                      to="/doctor/reset-password"
                      className="text-xs text-blue-steel hover:underline"
                    >
                      Esqueceu a senha?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    autoFocus
                    error={!!loginForm.formState.errors.password}
                    {...loginForm.register('password')}
                  />
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-red-600">
                      {loginForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  loading={loginForm.formState.isSubmitting}
                >
                  Entrar
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setStep('email')
                    setServerError(null)
                  }}
                >
                  Usar outro email
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
