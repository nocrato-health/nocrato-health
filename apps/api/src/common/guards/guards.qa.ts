/**
 * QA Script — US-0.3: Validação de Guards e Decorators
 * Executar: pnpm --filter @nocrato/api qa:guards
 *
 * Não é um teste Jest — é um script de validação manual para o QA.
 * Cria uma mini-app NestJS em memória com um controller de teste
 * e dispara requests HTTP reais para validar os critérios de aceitação.
 */

// Seta variáveis de ambiente antes de qualquer import do projeto
process.env.JWT_SECRET = 'qa-test-secret-nocrato-health-v2-1234'
process.env.JWT_REFRESH_SECRET = 'qa-refresh-secret-nocrato-health-v2-1234'
process.env.JWT_EXPIRES_IN = '15m'
process.env.JWT_REFRESH_EXPIRES_IN = '7d'
process.env.DB_HOST = 'localhost'
process.env.DB_PORT = '5432'
process.env.DB_NAME = 'nocrato'
process.env.DB_USER = 'nocrato'
process.env.DB_PASSWORD = 'password'
process.env.RESEND_API_KEY = 're_placeholder'
process.env.EMAIL_FROM = 'test@test.com'
process.env.EVOLUTION_API_URL = 'http://localhost:8080'
process.env.EVOLUTION_API_KEY = 'placeholder'
process.env.EVOLUTION_INSTANCE = 'nocrato'
process.env.EVOLUTION_WEBHOOK_TOKEN = 'placeholder'
process.env.OPENAI_API_KEY = 'sk-placeholder'

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, Controller, Get, UseGuards, Module } from '@nestjs/common'
import request from 'supertest'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { JwtAuthGuard } from './jwt-auth.guard'
import { RolesGuard } from './roles.guard'
import { TenantGuard } from './tenant.guard'
import { Roles } from '../decorators/roles.decorator'
import { JwtStrategy } from '../../modules/auth/strategies/jwt.strategy'
import { HttpExceptionFilter } from '../filters/http-exception.filter'

@Controller('test')
@UseGuards(JwtAuthGuard, RolesGuard)
class QaTestController {
  @Get('agency-admin')
  @Roles('agency_admin')
  agencyAdminOnly() {
    return { ok: true, route: 'agency_admin' }
  }

  @Get('agency-any')
  @Roles('agency_admin', 'agency_member')
  agencyAny() {
    return { ok: true, route: 'agency_any' }
  }

  @Get('doctor')
  @UseGuards(TenantGuard)
  @Roles('doctor')
  doctorOnly() {
    return { ok: true, route: 'doctor' }
  }
}

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: 'qa-test-secret-nocrato-health-v2-1234',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [QaTestController],
  providers: [JwtStrategy],
})
class QaTestModule {}

async function runQa() {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [QaTestModule],
  }).compile()

  const app: INestApplication = moduleRef.createNestApplication()
  app.useGlobalFilters(new HttpExceptionFilter())
  await app.init()

  const jwtService = moduleRef.get<JwtService>(JwtService)

  const tokens = {
    agencyAdmin: jwtService.sign({ sub: 'u1', type: 'agency', role: 'agency_admin' }),
    agencyMember: jwtService.sign({ sub: 'u2', type: 'agency', role: 'agency_member' }),
    doctorWithTenant: jwtService.sign({ sub: 'u3', type: 'doctor', role: 'doctor', tenantId: 'tenant-uuid-1' }),
    doctorWithoutTenant: jwtService.sign({ sub: 'u4', type: 'doctor', role: 'doctor' }),
  }

  let passed = 0
  let failed = 0

  async function assert(label: string, fn: () => Promise<void>) {
    try {
      await fn()
      console.log(`  ✅ ${label}`)
      passed++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`  ❌ ${label} — ${msg}`)
      failed++
    }
  }

  const http = request(app.getHttpServer())

  console.log('\n🧪 QA — US-0.3: Guards & Decorators\n')
  console.log('── Critério principal: sem token → 401, role errada → 403 ──\n')

  // 401 — Token ausente
  await assert('Sem token → 401', async () => {
    const res = await http.get('/test/agency-admin')
    if (res.status !== 401) throw new Error(`got ${res.status}, body: ${JSON.stringify(res.body)}`)
  })

  await assert('Token malformado → 401', async () => {
    const res = await http.get('/test/agency-admin').set('Authorization', 'Bearer lixo.fake.jwt')
    if (res.status !== 401) throw new Error(`got ${res.status}`)
  })

  await assert('Token válido sem Bearer prefix → 401', async () => {
    const res = await http.get('/test/agency-admin').set('Authorization', tokens.agencyAdmin)
    if (res.status !== 401) throw new Error(`got ${res.status}`)
  })

  // 403 — Role errada
  await assert('agency_member → rota agency_admin → 403', async () => {
    const res = await http.get('/test/agency-admin').set('Authorization', `Bearer ${tokens.agencyMember}`)
    if (res.status !== 403) throw new Error(`got ${res.status}`)
  })

  await assert('doctor → rota agency_admin → 403', async () => {
    const res = await http.get('/test/agency-admin').set('Authorization', `Bearer ${tokens.doctorWithTenant}`)
    if (res.status !== 403) throw new Error(`got ${res.status}`)
  })

  await assert('agency_admin → rota doctor → 403 (role errada)', async () => {
    const res = await http.get('/test/doctor').set('Authorization', `Bearer ${tokens.agencyAdmin}`)
    if (res.status !== 403) throw new Error(`got ${res.status}`)
  })

  await assert('doctor sem tenantId → rota doctor → 403 (TenantGuard)', async () => {
    const res = await http.get('/test/doctor').set('Authorization', `Bearer ${tokens.doctorWithoutTenant}`)
    if (res.status !== 403) throw new Error(`got ${res.status}`)
  })

  // 200 — Acesso correto
  await assert('agency_admin → rota agency_admin → 200', async () => {
    const res = await http.get('/test/agency-admin').set('Authorization', `Bearer ${tokens.agencyAdmin}`)
    if (res.status !== 200) throw new Error(`got ${res.status}`)
  })

  await assert('agency_member → rota agency_any → 200', async () => {
    const res = await http.get('/test/agency-any').set('Authorization', `Bearer ${tokens.agencyMember}`)
    if (res.status !== 200) throw new Error(`got ${res.status}`)
  })

  await assert('doctor com tenantId → rota doctor → 200', async () => {
    const res = await http.get('/test/doctor').set('Authorization', `Bearer ${tokens.doctorWithTenant}`)
    if (res.status !== 200) throw new Error(`got ${res.status}`)
  })

  // Shape do erro
  await assert('Resposta de 401 tem { statusCode, message, timestamp }', async () => {
    const res = await http.get('/test/agency-admin')
    const body = res.body as Record<string, unknown>
    if (body.statusCode !== 401) throw new Error(`statusCode esperado 401, got ${body.statusCode}`)
    if (!body.message) throw new Error('campo message ausente')
    if (!body.timestamp) throw new Error('campo timestamp ausente')
  })

  await assert('Resposta de 403 tem { statusCode, message, timestamp }', async () => {
    const res = await http.get('/test/agency-admin').set('Authorization', `Bearer ${tokens.agencyMember}`)
    const body = res.body as Record<string, unknown>
    if (body.statusCode !== 403) throw new Error(`statusCode esperado 403, got ${body.statusCode}`)
    if (!body.message) throw new Error('campo message ausente')
    if (!body.timestamp) throw new Error('campo timestamp ausente')
  })

  await app.close()

  console.log(`\n📊 Resultado: ${passed} passou(aram) | ${failed} falhou(aram)`)

  if (failed > 0) {
    console.log('\n🚫 QA REPROVADO — corrigir antes de avançar\n')
    process.exit(1)
  } else {
    console.log('\n✅ QA APROVADO — US-0.3 pode ser marcada como concluída\n')
    process.exit(0)
  }
}

runQa().catch((e) => {
  console.error('Erro ao rodar QA:', e)
  process.exit(1)
})
