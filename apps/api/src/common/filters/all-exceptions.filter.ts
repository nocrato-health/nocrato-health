import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { Sentry } from '@/observability/sentry'
import { redactPiiInString } from '@/common/logging/redact-pii'

/**
 * Filtro catch-all para exceções NÃO-HTTP.
 *
 * O `HttpExceptionFilter` existente captura erros esperados do domínio
 * (BadRequest, NotFound, Unauthorized etc) e formata o response — esses
 * NÃO devem ir para o Bugsink, são fluxo normal.
 *
 * Este filtro catch-all captura o resto: erros de lógica, falhas de DB,
 * exceções não tratadas em services. Esses são bugs reais e devem ser
 * reportados ao Bugsink.
 *
 * Registrado em main.ts ANTES do HttpExceptionFilter — NestJS aplica na
 * ordem inversa, então o HttpExceptionFilter (mais específico) tem
 * precedência para HttpException.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    // Se é HttpException, o HttpExceptionFilter mais específico já pegou antes.
    // Este catch-all serve apenas para erros não-HTTP (500 reais / bugs).
    if (exception instanceof HttpException) {
      return
    }

    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<{ method: string; url: string }>()

    const err = exception instanceof Error ? exception : new Error(String(exception))

    // Log local com PII redatada (SEC-11).
    this.logger.error(
      redactPiiInString(`[${request.method} ${request.url}] ${err.message}`),
      redactPiiInString(err.stack ?? ''),
    )

    // Reporta ao Bugsink/Sentry — redactPii no beforeSend do SDK faz a
    // redação final do payload antes do envio à rede.
    Sentry.captureException(err, {
      tags: {
        method: request.method,
        // Nunca colocar URL completa (pode ter query string com PII).
        // Apenas o pathname — já é suficiente pra agrupamento.
        path: request.url?.split('?')[0] ?? 'unknown',
      },
    })

    response.status(500).json({
      statusCode: 500,
      message: 'Erro interno do servidor',
      timestamp: new Date().toISOString(),
    })
  }
}
