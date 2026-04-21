import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, CheckCircle2, AlertTriangle, Smartphone, ShieldCheck } from 'lucide-react'

import {
  whatsappStatusQueryOptions,
  useWhatsAppConnectCloud,
  useWhatsAppGenerateQR,
  useWhatsAppDisconnect,
} from '@/lib/queries/whatsapp'
import { toast } from '@/lib/toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// ─── MetaSignupButton ─────────────────────────────────────────────────────────

interface MetaSignupButtonProps {
  onConnected: () => void
}

function MetaSignupButton({ onConnected }: MetaSignupButtonProps) {
  const connectCloud = useWhatsAppConnectCloud()

  React.useEffect(() => {
    if (typeof window === 'undefined' || (window as unknown as { FB?: unknown }).FB) return

    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      ;(window as unknown as { fbAsyncInit: () => void }).fbAsyncInit = function () {
        ;(window as unknown as { FB: { init: (opts: Record<string, unknown>) => void } }).FB.init({
          appId: import.meta.env.VITE_META_APP_ID as string,
          cookie: true,
          xfbml: false,
          version: 'v19.0',
          autoLogAppEvents: false,
        })
      }
    }
    document.body.appendChild(script)
  }, [])

  function launchSignup() {
    const FB = (window as unknown as { FB?: { login: (cb: (r: FBLoginResponse) => void, opts: Record<string, unknown>) => void } }).FB
    if (!FB) {
      toast.error('SDK do Meta ainda carregando, aguarde alguns segundos')
      return
    }

    FB.login(
      function (response: FBLoginResponse) {
        if (response.authResponse?.code) {
          connectCloud.mutate(
            { code: response.authResponse.code },
            {
              onSuccess: () => {
                toast.success('WhatsApp conectado via Meta!')
                onConnected()
              },
              onError: (err) => {
                toast.error(err.message || 'Erro ao conectar via Meta')
              },
            },
          )
        }
      },
      {
        config_id: import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID as string,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          feature: 'whatsapp_embedded_signup',
          sessionInfoVersion: '3',
        },
      },
    )
  }

  return (
    <Button
      onClick={launchSignup}
      loading={connectCloud.isPending}
      className="w-full sm:w-auto"
    >
      {connectCloud.isPending ? 'Conectando...' : 'Conectar via Meta'}
    </Button>
  )
}

// ─── Tipo auxiliar para o SDK do Facebook ────────────────────────────────────

interface FBLoginResponse {
  authResponse?: {
    code?: string
  }
  status?: string
}

// ─── DisconnectedState ────────────────────────────────────────────────────────

interface DisconnectedStateProps {
  onConnected: () => void
}

function DisconnectedState({ onConnected }: DisconnectedStateProps) {
  const [showQR, setShowQR] = React.useState(false)
  const generateQR = useWhatsAppGenerateQR()

  function handleGenerateQR() {
    generateQR.mutate(undefined, {
      onSuccess: () => {
        setShowQR(true)
      },
      onError: (err) => {
        toast.error(err.message || 'Erro ao gerar QR code')
      },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-amber-dark">WhatsApp</h1>
        <p className="text-sm text-[#af830d] mt-1">
          Conecte o WhatsApp do consultório para ativar o agente de agendamento.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card: WhatsApp Oficial (Meta) */}
        <Card className="border-[#e8dfc8] relative overflow-hidden">
          {/* Badge recomendado */}
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-bright/20 px-2.5 py-0.5 text-xs font-semibold text-amber-dark border border-amber-bright/40">
              Recomendado
            </span>
          </div>

          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fef9e6] border border-amber-bright/30">
                <ShieldCheck className="h-5 w-5 text-amber-dark" />
              </div>
              <CardTitle className="text-base">WhatsApp Oficial</CardTitle>
            </div>
            <CardDescription className="text-sm leading-relaxed">
              Conexão via Meta Business Platform. Número verificado, sem risco de ban e com suporte
              oficial. Ideal para uso em produção.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-0">
            <MetaSignupButton onConnected={onConnected} />
          </CardContent>
        </Card>

        {/* Card: WhatsApp Não-Oficial (Evolution) */}
        <Card className="border-[#e8dfc8]">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange/10 border border-orange/20">
                <Smartphone className="h-5 w-5 text-orange" />
              </div>
              <CardTitle className="text-base text-[#6e5305]">WhatsApp Não-Oficial</CardTitle>
            </div>
            <CardDescription className="text-sm leading-relaxed">
              Conexão via QR code com Evolution API. Sujeito a risco de ban pelo WhatsApp.
              Use apenas para testes ou como fallback temporário.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-0 space-y-3">
            {!showQR ? (
              <Button
                variant="outline"
                onClick={handleGenerateQR}
                loading={generateQR.isPending}
                className="w-full sm:w-auto"
              >
                {generateQR.isPending ? 'Gerando...' : 'Gerar QR Code'}
              </Button>
            ) : (
              <div className="space-y-3">
                {generateQR.data?.qrCode ? (
                  <div className="flex flex-col items-start gap-2">
                    <img
                      src={generateQR.data.qrCode}
                      alt="QR Code para conectar WhatsApp"
                      className="w-48 h-48 rounded-lg border border-[#e8dfc8]"
                    />
                    <p className="text-xs text-[#af830d]">
                      Abra o WhatsApp no celular, vá em Dispositivos vinculados e escaneie o código.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-[#af830d]">
                    <AlertTriangle className="h-4 w-4 text-orange shrink-0" />
                    QR code não disponível. Tente gerar novamente.
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQR(false)}
                  className="text-xs"
                >
                  Voltar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── ConnectedState ───────────────────────────────────────────────────────────

interface ConnectedStateProps {
  connectionType: 'cloud' | 'evolution'
  phoneNumber?: string
  verifiedName?: string
  instanceStatus?: string
}

function ConnectedState({ connectionType, phoneNumber, verifiedName, instanceStatus }: ConnectedStateProps) {
  const disconnect = useWhatsAppDisconnect()

  function handleDisconnect() {
    disconnect.mutate(undefined, {
      onError: (err) => {
        toast.error(err.message || 'Erro ao desconectar')
      },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-amber-dark">WhatsApp</h1>
        <p className="text-sm text-[#af830d] mt-1">
          Gerencie a conexão do WhatsApp do consultório.
        </p>
      </div>

      <Card className="border-[#e8dfc8]">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[#1a1a1a]">Conectado</span>
                  {connectionType === 'cloud' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                      <ShieldCheck className="h-3 w-3" />
                      WhatsApp Oficial Meta
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange/10 px-2.5 py-0.5 text-xs font-semibold text-orange border border-orange/20">
                      <Smartphone className="h-3 w-3" />
                      Evolution API
                    </span>
                  )}
                </div>

                {connectionType === 'cloud' && (
                  <div className="space-y-0.5">
                    {verifiedName && (
                      <p className="text-sm text-[#1a1a1a] font-medium">{verifiedName}</p>
                    )}
                    {phoneNumber && (
                      <p className="text-sm text-[#af830d]">{phoneNumber}</p>
                    )}
                  </div>
                )}

                {connectionType === 'evolution' && instanceStatus && (
                  <p className="text-sm text-[#af830d] capitalize">
                    Status: {instanceStatus}
                  </p>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              loading={disconnect.isPending}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 shrink-0"
            >
              {disconnect.isPending ? 'Desconectando...' : 'Desconectar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-amber-bright/30 bg-[#fef9e6] p-4">
        <div className="flex gap-3">
          <MessageCircle className="h-5 w-5 text-amber-dark shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-dark">Agente ativo</p>
            <p className="text-sm text-[#af830d] mt-0.5">
              O agente de agendamento está pronto para receber mensagens dos pacientes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton de carregamento ─────────────────────────────────────────────────

function WhatsAppPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function DoctorWhatsAppPage() {
  const { data: status, isLoading, refetch } = useQuery(whatsappStatusQueryOptions())

  if (isLoading) return <WhatsAppPageSkeleton />

  if (status?.connected && status.connectionType) {
    return (
      <ConnectedState
        connectionType={status.connectionType}
        phoneNumber={status.phoneNumber}
        verifiedName={status.verifiedName}
        instanceStatus={status.instanceStatus}
      />
    )
  }

  return <DisconnectedState onConnected={() => void refetch()} />
}
