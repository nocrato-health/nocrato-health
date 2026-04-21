import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { env } from '@/config/env'
import type {
  SignupBasedConnectionProvider,
  SignupCodeResult,
} from './whatsapp-connection.provider'

@Injectable()
export class CloudApiConnectionProvider implements SignupBasedConnectionProvider {
  private readonly logger = new Logger(CloudApiConnectionProvider.name)

  private get graphBase(): string {
    return `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`
  }

  /** Garante que as variáveis obrigatórias da Cloud API estão definidas. */
  private requireCloudEnv(): {
    appId: string
    appSecret: string
    systemUserToken: string
  } {
    if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_SYSTEM_USER_TOKEN) {
      throw new InternalServerErrorException(
        'Integração com Meta Cloud API não configurada — defina META_APP_ID, META_APP_SECRET e META_SYSTEM_USER_TOKEN',
      )
    }
    return {
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      systemUserToken: env.META_SYSTEM_USER_TOKEN,
    }
  }

  // ---------------------------------------------------------------------------
  // Método da Cloud API (SignupBasedConnectionProvider)
  // ---------------------------------------------------------------------------

  /**
   * Troca o código OAuth do Embedded Signup pelos dados do número WhatsApp
   * associado ao doutor.
   *
   * Fluxo:
   * 1. POST /oauth/access_token → access_token efêmero
   * 2. GET  /debug_token        → waba_id via granular_scopes
   * 3. GET  /{waba_id}/phone_numbers → phone_number_id, display_phone_number, verified_name
   */
  async exchangeSignupCode(code: string): Promise<SignupCodeResult> {
    const { appId, appSecret, systemUserToken } = this.requireCloudEnv()

    // 1. Trocar code por access_token
    const tokenUrl = new URL(`${this.graphBase}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('code', code)

    const tokenResponse = await fetch(tokenUrl.toString(), { method: 'POST' })

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text().catch(() => '(corpo indisponível)')
      this.logger.error(`Falha ao trocar código OAuth por access_token: HTTP ${tokenResponse.status} — ${body}`)
      throw new BadRequestException('Código de autorização inválido ou expirado')
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: unknown }

    if (!tokenData.access_token) {
      this.logger.error(`Resposta de oauth/access_token sem access_token: ${JSON.stringify(tokenData)}`)
      throw new BadRequestException('Não foi possível obter access_token da Meta')
    }

    const accessToken = tokenData.access_token

    // 2. Inspecionar token para pegar waba_id via granular_scopes
    const debugUrl = new URL(`${this.graphBase}/debug_token`)
    debugUrl.searchParams.set('input_token', accessToken)
    debugUrl.searchParams.set('access_token', systemUserToken)

    const debugResponse = await fetch(debugUrl.toString())

    if (!debugResponse.ok) {
      const body = await debugResponse.text().catch(() => '(corpo indisponível)')
      this.logger.error(`Falha ao chamar debug_token: HTTP ${debugResponse.status} — ${body}`)
      throw new BadRequestException('Não foi possível validar o token da Meta')
    }

    const debugData = (await debugResponse.json()) as {
      data?: {
        granular_scopes?: Array<{
          scope: string
          target_ids?: string[]
        }>
      }
    }

    const wabaScope = debugData.data?.granular_scopes?.find(
      (s) => s.scope === 'whatsapp_business_management' || s.scope === 'business_management',
    )
    const wabaId = wabaScope?.target_ids?.[0]

    if (!wabaId) {
      this.logger.error(
        `waba_id não encontrado em debug_token — granular_scopes: ${JSON.stringify(debugData.data?.granular_scopes)}`,
      )
      throw new BadRequestException(
        'Não foi possível identificar a WhatsApp Business Account — verifique as permissões concedidas',
      )
    }

    // 3. Buscar números de telefone associados à WABA
    const phoneNumbersUrl = `${this.graphBase}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`

    const phoneNumbersResponse = await fetch(phoneNumbersUrl, {
      headers: {
        Authorization: `Bearer ${systemUserToken}`,
      },
    })

    if (!phoneNumbersResponse.ok) {
      const body = await phoneNumbersResponse.text().catch(() => '(corpo indisponível)')
      this.logger.error(
        `Falha ao listar phone_numbers da WABA ${wabaId}: HTTP ${phoneNumbersResponse.status} — ${body}`,
      )
      throw new BadRequestException('Não foi possível obter os dados do número WhatsApp')
    }

    const phoneNumbersData = (await phoneNumbersResponse.json()) as {
      data?: Array<{
        id: string
        display_phone_number: string
        verified_name: string
      }>
    }

    const phoneNumber = phoneNumbersData.data?.[0]

    if (!phoneNumber) {
      throw new BadRequestException(
        'Nenhum número de telefone encontrado na WhatsApp Business Account',
      )
    }

    return {
      phoneNumberId: phoneNumber.id,
      wabaId,
      displayPhoneNumber: phoneNumber.display_phone_number,
      verifiedName: phoneNumber.verified_name,
    }
  }
}
