import './config/env' // valida variáveis de ambiente na inicialização
// Sentry/Bugsink init DEVE rodar antes de qualquer require do app — o SDK
// monkey-patcha bibliotecas (http, express) no import. Por isso fica aqui
// em cima, logo após o env.
import { initSentry } from './observability/sentry'
initSentry()

import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  })

  // Confia no primeiro proxy (Nginx) para ler o IP real do cliente via X-Real-IP / X-Forwarded-For
  // Sem isso, req.ip retorna o IP interno do Docker (Nginx) e o rate limit quebra em produção
  app.getHttpAdapter().getInstance().set('trust proxy', 1)

  app.use(helmet())
  app.enableCors({
    origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : ['http://localhost:5173', env.FRONTEND_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
  app.setGlobalPrefix('api/v1', { exclude: ['health'] })
  // Ordem importa: NestJS aplica filtros na ordem inversa do registro.
  // Registramos AllExceptionsFilter PRIMEIRO (catch-all para não-HTTP → Bugsink)
  // e HttpExceptionFilter DEPOIS (catch específico para HttpException).
  // Resultado: HttpException → HttpExceptionFilter, resto → AllExceptionsFilter.
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter())

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Nocrato Health API')
      .setDescription('API para gestão de consultórios médicos')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api/docs', app, document)
  }

  await app.listen(env.PORT)
  console.log(`🚀 API rodando em http://localhost:${env.PORT}`)
  console.log(`❤️  Health check: http://localhost:${env.PORT}/health`)
}

bootstrap()
