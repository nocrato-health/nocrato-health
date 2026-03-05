import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common'
import type { Response } from 'express'

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse()

    const isObject = typeof exceptionResponse === 'object' && exceptionResponse !== null
    const exceptionObj = isObject ? (exceptionResponse as Record<string, unknown>) : {}

    const message = isObject ? (exceptionObj.message ?? 'Erro interno') : exceptionResponse

    const extra = isObject
      ? Object.fromEntries(
          Object.entries(exceptionObj).filter(([k]) => !['message', 'statusCode', 'error'].includes(k)),
        )
      : {}

    response.status(status).json({
      statusCode: status,
      message,
      ...extra,
      timestamp: new Date().toISOString(),
    })
  }
}
