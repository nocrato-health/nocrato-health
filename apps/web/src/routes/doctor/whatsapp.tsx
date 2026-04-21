import * as React from 'react'
import { MessageCircle, ShieldCheck } from 'lucide-react'

import { useWhatsAppConnectCloud } from '@/lib/queries/whatsapp'
import { toast } from '@/lib/toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

// ─── Tipo auxiliar para o SDK do Facebook ────────────────────────────────────

interface FBLoginResponse {
  authResponse?: {
    code?: string
  }
  status?: string
}

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
    const FB = (
      window as unknown as {
        FB?: {
          login: (cb: (r: FBLoginResponse) => void, opts: Record<string, unknown>) => void
        }
      }
    ).FB
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

// ─── ConnectedState ───────────────────────────────────────────────────────────

interface ConnectedStateProps {
  phoneNumber?: string
  verifiedName?: string
}

function ConnectedState({ phoneNumber, verifiedName }: ConnectedStateProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-amber-dark">WhatsApp</h1>
        <p className="text-sm text-amber-mid mt-1">
          Gerencie a conexão do WhatsApp do consultório.
        </p>
      </div>

      <Card className="border-[#e8dfc8]">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[#1a1a1a]">Conectado</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  WhatsApp Oficial Meta
                </span>
              </div>

              <div className="space-y-0.5">
                {verifiedName && (
                  <p className="text-sm text-[#1a1a1a] font-medium">{verifiedName}</p>
                )}
                {phoneNumber && (
                  <p className="text-sm text-amber-mid">{phoneNumber}</p>
                )}
              </div>
            </div>
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

// ─── DisconnectedState ────────────────────────────────────────────────────────

interface DisconnectedStateProps {
  onConnected: (data: { phoneNumber: string; verifiedName: string }) => void
}

function DisconnectedState({ onConnected }: DisconnectedStateProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-amber-dark">WhatsApp</h1>
        <p className="text-sm text-[#af830d] mt-1">
          Conecte o WhatsApp do consultório para ativar o agente de agendamento.
        </p>
      </div>

      <Card className="border-[#e8dfc8] relative overflow-hidden max-w-md">
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
            oficial.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          <MetaSignupButton onConnected={() => onConnected({ phoneNumber: '', verifiedName: '' })} />
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function DoctorWhatsAppPage() {
  const [connected, setConnected] = React.useState<{
    phoneNumber: string
    verifiedName: string
  } | null>(null)

  if (connected) {
    return (
      <ConnectedState
        phoneNumber={connected.phoneNumber}
        verifiedName={connected.verifiedName}
      />
    )
  }

  return <DisconnectedState onConnected={setConnected} />
}
