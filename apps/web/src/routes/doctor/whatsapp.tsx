import * as React from 'react'
import { MessageSquare, RefreshCw, CheckCircle2, Wifi, WifiOff } from 'lucide-react'

import {
  useWhatsAppStatus,
  useWhatsAppConnect,
  useWhatsAppQr,
  useWhatsAppDisconnect,
} from '@/lib/queries/whatsapp'
import { toast } from '@/lib/toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskPhoneNumber(phone: string): string {
  // Mantém os últimos 4 dígitos visíveis: ****-1234
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `****-${digits.slice(-4)}`
}

// ─── Estado 1: Não configurado / desconectado ─────────────────────────────────

interface DisconnectedStateProps {
  hasInstance: boolean
  onConnect: () => void
  isConnecting: boolean
}

function DisconnectedState({ hasInstance, onConnect, isConnecting }: DisconnectedStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-[#fef9e6] flex items-center justify-center">
        <WifiOff className="w-8 h-8 text-amber-mid" />
      </div>

      <div className="space-y-2">
        <h2 className="font-heading font-bold text-xl text-amber-dark">
          Conectar WhatsApp
        </h2>
        <p className="text-sm text-[#6b5b3e] leading-relaxed max-w-sm">
          Conecte seu WhatsApp para ativar o agente de atendimento automático.
          Escaneie o QR code com o app WhatsApp do seu celular.
        </p>
      </div>

      <Button
        onClick={onConnect}
        loading={isConnecting}
        className="bg-amber-bright hover:bg-amber-mid text-amber-dark font-semibold px-6"
      >
        {hasInstance ? 'Reconectar' : 'Gerar QR Code'}
      </Button>
    </div>
  )
}

// ─── Estado 2: Aguardando scan do QR ─────────────────────────────────────────

interface QrStateProps {
  qrCode: string | null
  isLoadingQr: boolean
}

function QrState({ qrCode, isLoadingQr }: QrStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      <div className="space-y-2">
        <h2 className="font-heading font-bold text-xl text-amber-dark">
          Escaneie o QR Code
        </h2>
        <p className="text-sm text-[#6b5b3e] leading-relaxed max-w-sm">
          Abra o WhatsApp no celular &rarr; Menu &rarr; Dispositivos conectados
          &rarr; Conectar dispositivo
        </p>
      </div>

      {/* QR Code */}
      <div className="relative flex items-center justify-center w-[280px] h-[280px] rounded-xl border-2 border-[#e8dfc8] bg-white shadow-sm">
        {isLoadingQr || !qrCode ? (
          <Skeleton className="w-[256px] h-[256px] rounded-lg" />
        ) : (
          <img
            src={`data:image/png;base64,${qrCode}`}
            alt="QR Code WhatsApp"
            width={256}
            height={256}
            className="rounded-lg"
          />
        )}
      </div>

      {/* Indicador de atualização automática */}
      <div className="flex items-center gap-2 text-xs text-blue-steel">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>QR code atualiza automaticamente a cada 3 segundos</span>
      </div>
    </div>
  )
}

// ─── Estado 3: Conectado ──────────────────────────────────────────────────────

interface ConnectedStateProps {
  instanceName: string
  phoneNumber?: string
  onDisconnect: () => void
  isDisconnecting: boolean
}

function ConnectedState({ instanceName, phoneNumber, onDisconnect, isDisconnecting }: ConnectedStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
            <Wifi className="w-3.5 h-3.5" />
            Conectado
          </span>
        </div>
        <h2 className="font-heading font-bold text-xl text-amber-dark">
          WhatsApp ativo
        </h2>
        <p className="text-sm text-[#6b5b3e] leading-relaxed max-w-sm">
          Seu agente WhatsApp está ativo e respondendo pacientes automaticamente.
        </p>
      </div>

      {/* Detalhes da instância */}
      <div className="w-full rounded-lg border border-[#e8dfc8] bg-[#fef9e6] p-4 space-y-2 text-left">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#8a7350] font-medium">Instância</span>
          <span className="text-amber-dark font-semibold font-mono text-xs">{instanceName}</span>
        </div>
        {phoneNumber && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#8a7350] font-medium">Número</span>
            <span className="text-amber-dark font-semibold">{maskPhoneNumber(phoneNumber)}</span>
          </div>
        )}
      </div>

      <Button
        variant="destructive"
        onClick={onDisconnect}
        loading={isDisconnecting}
        className="w-full"
      >
        Desconectar
      </Button>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function DoctorWhatsAppPage() {
  const [connectInitiated, setConnectInitiated] = React.useState(false)

  // Polling ativo quando aguardando conexão ou reconexão
  const pollingActive = connectInitiated
  const { data: statusData, isLoading: isLoadingStatus } = useWhatsAppStatus(pollingActive)

  const status = statusData?.status ?? 'not_configured'

  // QR polling ativo apenas quando aguardando scan
  const qrPollingEnabled =
    connectInitiated && (status === 'connecting' || status === 'close' || status === 'not_configured')

  const { data: qrData, isLoading: isLoadingQr } = useWhatsAppQr(qrPollingEnabled) as {
    data: { qrCode?: string; status?: string } | undefined
    isLoading: boolean
  }

  const [initialQrCode, setInitialQrCode] = React.useState<string | null>(null)
  const connectMutation = useWhatsAppConnect()
  const disconnectMutation = useWhatsAppDisconnect()

  // Quando status muda para 'open', desativa o modo de conexão iniciada
  React.useEffect(() => {
    if (status === 'open') {
      setConnectInitiated(false)
    }
  }, [status])

  function handleConnect() {
    connectMutation.mutate(undefined, {
      onSuccess: (data: unknown) => {
        setConnectInitiated(true)
        const result = data as { qrCode?: string } | undefined
        if (result?.qrCode) setInitialQrCode(result.qrCode)
      },
      onError: () => {
        toast.error('Erro ao iniciar conexão. Tente novamente.')
      },
    })
  }

  function handleDisconnect() {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        setConnectInitiated(false)
        setInitialQrCode(null)
        toast.success('WhatsApp desconectado com sucesso.')
      },
      onError: () => {
        toast.error('Erro ao desconectar. Tente novamente.')
      },
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Cabeçalho da página */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#fef9e6] flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-amber-mid" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-2xl text-amber-dark">WhatsApp</h1>
            <p className="text-sm text-[#8a7350]">Conexão com o agente de atendimento</p>
          </div>
        </div>
      </div>

      {/* Card central */}
      <div className="flex justify-center">
        <Card className="w-full max-w-[500px] rounded-xl border border-[#e8dfc8] bg-white shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="sr-only">Gerenciar conexão WhatsApp</CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            {isLoadingStatus ? (
              <div className="flex flex-col items-center gap-6">
                <Skeleton className="w-16 h-16 rounded-full" />
                <div className="space-y-2 w-full max-w-xs">
                  <Skeleton className="h-6 w-3/4 mx-auto" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6 mx-auto" />
                </div>
                <Skeleton className="h-10 w-40" />
              </div>
            ) : status === 'open' ? (
              <ConnectedState
                instanceName={statusData?.instanceName ?? ''}
                phoneNumber={statusData?.phoneNumber}
                onDisconnect={handleDisconnect}
                isDisconnecting={disconnectMutation.isPending}
              />
            ) : connectInitiated ? (
              <QrState
                qrCode={qrData?.qrCode ?? initialQrCode}
                isLoadingQr={isLoadingQr && !qrData?.qrCode && !initialQrCode}
              />
            ) : (
              <DisconnectedState
                hasInstance={status === 'close'}
                onConnect={handleConnect}
                isConnecting={connectMutation.isPending}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
