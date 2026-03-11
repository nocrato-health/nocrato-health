import './config/env' // valida variáveis de ambiente na inicialização
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  })

  app.use(helmet())
  app.enableCors()
  app.setGlobalPrefix('api/v1', { exclude: ['health'] })
  app.useGlobalFilters(new HttpExceptionFilter())

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
