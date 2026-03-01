/**
 * setup-test-data.ts
 *
 * Script utilitário para criar (ou resetar) dados de teste de doutores no banco.
 * Executado pelo globalSetup do Playwright antes da suíte E2E de doctor.
 *
 * Cria dois doutores:
 *   - test-new@nocrato.com  → onboarding_completed = false  (para CT-32-01, CT-32-02, CT-32-04, CT-32-05)
 *   - test-done@nocrato.com → onboarding_completed = true   (para CT-32-03)
 *
 * É idempotente: se os registros já existem, reseta ao estado inicial.
 */
import knex from 'knex'
import bcrypt from 'bcrypt'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

const TEST_PASSWORD = 'Doctor123!'

export const TEST_DOCTOR_NEW = {
  email: 'test-new@nocrato.com',
  tenantSlug: 'test-new-doctor',
}

export const TEST_DOCTOR_DONE = {
  email: 'test-done@nocrato.com',
  tenantSlug: 'test-done-doctor',
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

    await setupDoctor(db, {
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
    })

    console.log('✅ Dados de teste criados/resetados com sucesso.')
  } finally {
    await db.destroy()
  }
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
  },
) {
  // Remover registros existentes em ordem correta (FK constraints)
  const existingTenant = await db('tenants').where({ slug: opts.tenantSlug }).first()

  if (existingTenant) {
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
}

setupTestData().catch((err) => {
  console.error('❌ Erro ao configurar dados de teste:', err)
  process.exit(1)
})
