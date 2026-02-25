import './config/env' // valida variáveis de ambiente na inicialização
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  })

  app.enableCors()
  app.setGlobalPrefix('api/v1', { exclude: ['health'] })
  app.useGlobalFilters(new HttpExceptionFilter())

  await app.listen(env.PORT)
  console.log(`🚀 API rodando em http://localhost:${env.PORT}`)
  console.log(`❤️  Health check: http://localhost:${env.PORT}/health`)
}

bootstrap()
