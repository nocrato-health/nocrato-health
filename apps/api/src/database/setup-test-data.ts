/**
 * setup-test-data.ts
 *
 * Script utilitário para criar (ou resetar) dados de teste de doutores no banco.
 * Executado pelo globalSetup do Playwright antes da suíte E2E de doctor.
 *
 * Cria um agency admin:
 *   - admin@nocrato.com / admin123 → agency_admin, status=active (para agency.spec.ts)
 *
 * Cria dois doutores:
 *   - test-new@nocrato.com  → onboarding_completed = false  (para CT-32-01, CT-32-02, CT-32-04, CT-32-05)
 *   - test-done@nocrato.com → onboarding_completed = true   (para CT-32-03, CT-45-xx)
 *
 * Pacientes de teste (para CT-45-xx, vinculados ao test-done doctor):
 *   - "Ana Lima"          → active
 *   - "Ana Souza"         → active
 *   - "João Costa"        → active
 *   - "Fernanda Oliveira" → inactive  (CT-45-03 inactive filter, CT-45-04 click)
 *
 * Appointments de teste (para CT-45-05, vinculados à "Fernanda Oliveira"):
 *   - hoje 10h UTC (scheduled)   — mais recente, aparece primeiro
 *   - 90 dias atrás (completed)
 *   - 180 dias atrás (completed) — mais antiga, aparece por último
 * Datas calculadas dinamicamente para não envelhecerem com o tempo (ex-TD: 2025-03-15 hardcoded).
 *
 * É idempotente: se os registros já existem, reseta ao estado inicial.
 */
import knex from 'knex'
import bcrypt from 'bcrypt'
import * as dotenv from 'dotenv'
import * as path from 'node:path'
import * as fs from 'node:fs'

// setup-test-data.ts é específico do Playwright — sempre carrega .env.test
// (se existir) por cima do .env, garantindo que aponte para o banco de teste.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.test') })
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

// Guard contra execução acidental em dev/prod — esse script apaga+recria
// dados de teste, nunca deve tocar o banco de desenvolvimento.
if (process.env.NODE_ENV !== 'test') {
  console.error(
    '❌ setup-test-data.ts só pode rodar com NODE_ENV=test\n' +
      '   Use: pnpm test:e2e:setup ou rode via globalSetup do Playwright.',
  )
  process.exit(1)
}

const TEST_PASSWORD = 'Doctor123!'

export const TEST_DOCTOR_NEW = {
  email: 'test-new@nocrato.com',
  tenantSlug: 'test-new-doctor',
}

export const TEST_DOCTOR_DONE = {
  email: 'test-done@nocrato.com',
  tenantSlug: 'test-done-doctor',
}

// Código de acesso do portal do paciente (CT-103-xx)
export const PORTAL_ACCESS_CODE = 'MRS-5678-PAC'

// Tokens de booking para a suíte Playwright (CT-75-xx)
// Cada token tem 64 chars hexadecimais (padrão do generateToken)
export const BOOKING_TOKENS = {
  valid:       'abcdef01'.repeat(8), // CT-75-01 happy path — projeto chromium (será consumido)
  validMobile: 'abcdef02'.repeat(8), // CT-75-01 happy path — projeto mobile (será consumido)
  expired:     'dead0000'.repeat(8), // CT-75-03 expirado
  withPhone:   'cafe1234'.repeat(8), // CT-75-04 phone='+5511987654321'
  conflict:    'beef5678'.repeat(8), // CT-75-05 race condition
}

async function setupTestData() {
  const db = knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'nocrato_health',
      user: process.env.DB_USER ?? 'nocrato',
      password: process.env.DB_PASSWORD ?? 'nocrato_secret',
    },
  })

  try {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

    await setupAgencyAdmin(db)

    await setupDoctor(db, {
      email: TEST_DOCTOR_NEW.email,
      tenantSlug: TEST_DOCTOR_NEW.tenantSlug,
      tenantName: 'Portal Teste (Novo)',
      doctorName: 'Dr. Teste Novo',
      passwordHash,
      onboardingCompleted: false,
      crm: null,
      crmState: null,
      workingHours: null,
      welcomeMessage: null,
    })

    const doneTenantId = await setupDoctor(db, {
      email: TEST_DOCTOR_DONE.email,
      tenantSlug: TEST_DOCTOR_DONE.tenantSlug,
      tenantName: 'Portal Teste (Completo)',
      doctorName: 'Dra. Teste Concluída',
      passwordHash,
      onboardingCompleted: true,
      crm: '654321',
      crmState: 'SP',
      workingHours: { monday: [{ start: '08:00', end: '17:00' }] },
      welcomeMessage: 'Olá! Sou a assistente da Dra. Teste.',
      primaryColor: '#D97706',
    })

    await setupPatients(db, doneTenantId)
    await setupPatientPortal(db, doneTenantId)
    await setupBookingTokens(db, doneTenantId)

    console.log('✅ Dados de teste criados/resetados com sucesso.')
  } finally {
    await db.destroy()
  }
}

async function setupAgencyAdmin(db: ReturnType<typeof knex>): Promise<void> {
  // Agency admin para agency.spec.ts — email/senha fixos referenciados nos testes.
  // Upsert atômico via ON CONFLICT: idempotente e sem janela de inconsistência
  // caso o insert falhe após o delete.
  const adminPasswordHash = await bcrypt.hash('admin123', 10)
  await db('agency_members')
    .insert({
      email: 'admin@nocrato.com',
      password_hash: adminPasswordHash,
      name: 'Admin Nocrato',
      role: 'agency_admin',
      status: 'active',
    })
    .onConflict('email')
    .merge(['password_hash', 'name', 'role', 'status'])
}

async function setupDoctor(
  db: ReturnType<typeof knex>,
  opts: {
    email: string
    tenantSlug: string
    tenantName: string
    doctorName: string
    passwordHash: string
    onboardingCompleted: boolean
    crm: string | null
    crmState: string | null
    workingHours: object | null
    welcomeMessage: string | null
    primaryColor?: string
  },
): Promise<string> {
  // Remover registros existentes em ordem correta (FK constraints)
  const existingTenant = await db('tenants').where({ slug: opts.tenantSlug }).first()

  if (existingTenant) {
    await db('documents').where({ tenant_id: existingTenant.id }).delete()
    await db('appointments').where({ tenant_id: existingTenant.id }).delete()
    await db('patients').where({ tenant_id: existingTenant.id }).delete()
    await db('agent_settings').where({ tenant_id: existingTenant.id }).delete()
    await db('doctors').where({ tenant_id: existingTenant.id }).delete()
    await db('tenants').where({ id: existingTenant.id }).delete()
  } else {
    // Pode existir doutor pelo email sem tenant com esse slug (edge case)
    await db('doctors').where({ email: opts.email }).delete()
  }

  // Criar tenant
  const [tenant] = await db('tenants')
    .insert({
      slug: opts.tenantSlug,
      name: opts.tenantName,
      ...(opts.primaryColor ? { primary_color: opts.primaryColor } : {}),
    })
    .returning(['id'])

  // Criar doutor
  await db('doctors').insert({
    tenant_id: tenant.id,
    email: opts.email,
    password_hash: opts.passwordHash,
    name: opts.doctorName,
    crm: opts.crm,
    crm_state: opts.crmState,
    working_hours: opts.workingHours ? JSON.stringify(opts.workingHours) : null,
    onboarding_completed: opts.onboardingCompleted,
    status: 'active',
  })

  // Criar agent_settings (criado no acceptDoctorInvite com enabled: false)
  await db('agent_settings').insert({
    tenant_id: tenant.id,
    welcome_message: opts.welcomeMessage ?? '',
    enabled: opts.onboardingCompleted,
    booking_mode: 'both',
  })

  return tenant.id as string
}

async function setupPatients(db: ReturnType<typeof knex>, tenantId: string): Promise<void> {
  // Criar 4 pacientes para o doutor completo (CT-45-xx)
  const patients = [
    { name: 'Ana Lima',          phone: '(11) 91111-0001', status: 'active' },
    { name: 'Ana Souza',         phone: '(11) 91111-0002', status: 'active' },
    { name: 'João Costa',        phone: '(11) 91111-0003', status: 'active' },
    { name: 'Fernanda Oliveira', phone: '(11) 91111-0004', status: 'inactive' },
  ]

  const insertedPatients = await db('patients')
    .insert(
      patients.map((p) => ({
        tenant_id: tenantId,
        name: p.name,
        phone: p.phone,
        source: 'manual',
        status: p.status,
      })),
    )
    .returning(['id', 'name'])

  // Adicionar 3 appointments à Fernanda Oliveira (para CT-45-05 — ordem DESC)
  const fernanda = insertedPatients.find((p: { id: string; name: string }) => p.name === 'Fernanda Oliveira')
  if (fernanda) {
    // Appointment de hoje às 10h UTC — crítico para CT-56-01 (dashboard mostra consultas de hoje)
    const todayAt10 = new Date()
    todayAt10.setUTCHours(10, 0, 0, 0)

    const DAY_MS = 24 * 60 * 60 * 1000
    const ninetyDaysAgo = new Date(todayAt10.getTime() - 90 * DAY_MS)
    const oneEightyDaysAgo = new Date(todayAt10.getTime() - 180 * DAY_MS)

    await db('appointments').insert([
      {
        tenant_id: tenantId,
        patient_id: fernanda.id,
        date_time: todayAt10.toISOString(),
        status: 'scheduled',
        duration_minutes: 30,
      },
      {
        tenant_id: tenantId,
        patient_id: fernanda.id,
        date_time: ninetyDaysAgo.toISOString(),
        status: 'completed',
        duration_minutes: 30,
      },
      {
        tenant_id: tenantId,
        patient_id: fernanda.id,
        date_time: oneEightyDaysAgo.toISOString(),
        status: 'completed',
        duration_minutes: 30,
      },
    ])
  }
}

async function setupPatientPortal(db: ReturnType<typeof knex>, tenantId: string): Promise<void> {
  // Criar paciente Maria Oliveira com portal ativo (CT-103-xx)
  const [maria] = await db('patients')
    .insert({
      tenant_id: tenantId,
      name: 'Maria Oliveira',
      phone: '(11) 91111-0099',
      source: 'manual',
      status: 'active',
      portal_access_code: PORTAL_ACCESS_CODE,
      portal_active: true,
    })
    .returning(['id'])

  // Appointment futuro (scheduled) — deve aparecer primeiro na ordenação
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 7)
  futureDate.setUTCHours(14, 0, 0, 0)

  // Appointment passado (completed)
  await db('appointments').insert([
    {
      tenant_id: tenantId,
      patient_id: maria.id,
      date_time: futureDate.toISOString(),
      status: 'scheduled',
      duration_minutes: 30,
    },
    {
      tenant_id: tenantId,
      patient_id: maria.id,
      date_time: '2025-06-15T10:00:00Z',
      status: 'completed',
      duration_minutes: 45,
    },
  ])

  // Criar diretório de uploads para o tenant (necessário para download no CT-103-05).
  // Usa process.cwd() — consistente com document.controller.ts que resolve os
  // paths da mesma forma. Ambos setup-test-data e API dev:test rodam com
  // cwd=apps/api, então "uploads/<tenant>" cai no mesmo diretório em disco.
  // Antes: path.resolve(__dirname, '../../../../../apps/api/uploads', ...) subia
  // 5 níveis (um a mais que deveria) e escrevia fora do monorepo — o arquivo
  // era criado mas a API nunca achava, resultando em 404 silencioso no CT-103-05.
  const uploadsDir = path.resolve(process.cwd(), 'uploads', tenantId)
  fs.mkdirSync(uploadsDir, { recursive: true })

  // Copiar fixture PDF para simular documento real no disco
  const fixtureSource = path.resolve(process.cwd(), '../web/e2e/fixtures/test-doc.pdf')
  const destFilename = 'portal-test-doc.pdf'
  const destPath = path.join(uploadsDir, destFilename)
  if (fs.existsSync(fixtureSource)) {
    fs.copyFileSync(fixtureSource, destPath)
  }

  const fileUrl = `/uploads/${tenantId}/${destFilename}`

  await db('documents').insert({
    tenant_id: tenantId,
    patient_id: maria.id,
    type: 'prescription',
    file_url: fileUrl,
    file_name: 'receita_2024.pdf',
    mime_type: 'application/pdf',
    description: 'Receita de teste para Playwright',
  })
}

async function setupBookingTokens(db: ReturnType<typeof knex>, tenantId: string): Promise<void> {
  const now = new Date()
  const expiredAt = new Date(now.getTime() - 2 * 60 * 60 * 1000)  // 2h atrás
  const validAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)    // 24h à frente

  await db('booking_tokens').insert([
    {
      tenant_id: tenantId,
      token: BOOKING_TOKENS.valid,
      phone: null,
      expires_at: validAt,
      used: false,
    },
    {
      tenant_id: tenantId,
      token: BOOKING_TOKENS.validMobile,
      phone: null,
      expires_at: validAt,
      used: false,
    },
    {
      tenant_id: tenantId,
      token: BOOKING_TOKENS.expired,
      phone: null,
      expires_at: expiredAt,
      used: false,
    },
    {
      tenant_id: tenantId,
      token: BOOKING_TOKENS.withPhone,
      phone: '+5511987654321',
      expires_at: validAt,
      used: false,
    },
    {
      tenant_id: tenantId,
      token: BOOKING_TOKENS.conflict,
      phone: null,
      expires_at: validAt,
      used: false,
    },
  ])
}

setupTestData().catch((err) => {
  console.error('❌ Erro ao configurar dados de teste:', err)
  process.exit(1)
})
