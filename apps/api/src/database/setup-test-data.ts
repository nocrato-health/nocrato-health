/**
 * setup-test-data.ts
 *
 * Script utilitário para criar (ou resetar) dados de teste de doutores no banco.
 * Executado pelo globalSetup do Playwright antes da suíte E2E de doctor.
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
 *   - 2025-03-15 → scheduled  (mais recente — deve aparecer primeiro)
 *   - 2025-01-10 → completed
 *   - 2024-12-01 → completed  (mais antiga — deve aparecer por último)
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
    })

    await setupPatients(db, doneTenantId)

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
): Promise<string> {
  // Remover registros existentes em ordem correta (FK constraints)
  const existingTenant = await db('tenants').where({ slug: opts.tenantSlug }).first()

  if (existingTenant) {
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
        date_time: '2025-01-10T14:00:00Z',
        status: 'completed',
        duration_minutes: 30,
      },
      {
        tenant_id: tenantId,
        patient_id: fernanda.id,
        date_time: '2024-12-01T09:00:00Z',
        status: 'completed',
        duration_minutes: 30,
      },
    ])
  }
}

setupTestData().catch((err) => {
  console.error('❌ Erro ao configurar dados de teste:', err)
  process.exit(1)
})
