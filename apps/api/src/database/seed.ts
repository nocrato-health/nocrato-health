import knex from 'knex'
import bcrypt from 'bcrypt'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString()
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString()
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString()
}

// ─── Counters para log final ──────────────────────────────────────────────────

const counts: Record<string, number> = {
  agency_members: 0,
  tenants: 0,
  doctors: 0,
  agent_settings: 0,
  patients: 0,
  appointments: 0,
  clinical_notes: 0,
  documents: 0,
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runSeed() {
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
    // ── 1. Agency admin ────────────────────────────────────────────────────────
    await db.raw(
      `
      INSERT INTO agency_members (email, password_hash, name, role, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (email) DO NOTHING
      `,
      ['admin@nocrato.com', await bcrypt.hash('admin123', 10), 'Admin Nocrato', 'agency_admin', 'active'],
    )

    const adminRow = await db('agency_members').where({ email: 'admin@nocrato.com' }).first()
    const isNew = !adminRow?.last_login_at && adminRow
    counts.agency_members = isNew ? 1 : 0

    // ── 2. Doutor 1 — Dra. Ana Silva (onboarding completo) ───────────────────
    const anaSlug = 'dr-ana-silva'
    await db.raw(
      `INSERT INTO tenants (slug, name, primary_color, status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (slug) DO NOTHING`,
      [anaSlug, 'Dra. Ana Silva — Clínica Geral', '#0066CC', 'active'],
    )

    const anaTenant = await db('tenants').where({ slug: anaSlug }).first()
    const anaTenantId: string = anaTenant.id

    const anaPasswordHash = await bcrypt.hash('Doctor123!', 10)

    const anaWorkingHours = {
      monday:    [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
      tuesday:   [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
      wednesday: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
      thursday:  [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
      friday:    [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    }

    await db.raw(
      `INSERT INTO doctors
         (tenant_id, email, password_hash, name, crm, crm_state, specialty,
          working_hours, appointment_duration, onboarding_completed, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)
       ON CONFLICT (email) DO NOTHING`,
      [
        anaTenantId,
        'ana.silva@nocrato.com',
        anaPasswordHash,
        'Dra. Ana Silva',
        'CRM-SP-123456',
        'SP',
        'Clínica Geral',
        JSON.stringify(anaWorkingHours),
        30,
        true,
        'active',
      ],
    )

    await db.raw(
      `INSERT INTO agent_settings
         (tenant_id, enabled, booking_mode, welcome_message, evolution_instance_name,
          personality, appointment_rules, faq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [
        anaTenantId,
        true,
        'both',
        'Olá! Sou a assistente da Dra. Ana Silva. Como posso ajudar?',
        'dr-ana-silva-instance',
        'Atenciosa, empática e profissional. Use linguagem acessível e evite termos técnicos desnecessários.',
        'Consultas de 30 minutos. Sem atendimento às sextas-feiras à tarde. Chegue 10 minutos antes do horário.',
        'P: Preciso de encaminhamento?\nR: Consulte a doutora — ela pode emitir encaminhamentos se necessário.\n\nP: Atende convênio?\nR: No momento apenas particular.',
      ],
    )

    counts.tenants += 1
    counts.doctors += 1
    counts.agent_settings += 1

    // ── 3. Doutor 2 — Dr. Carlos Mendes (onboarding incompleto) ──────────────
    const carlosSlug = 'dr-carlos-mendes'
    await db.raw(
      `INSERT INTO tenants (slug, name, status)
       VALUES (?, ?, ?)
       ON CONFLICT (slug) DO NOTHING`,
      [carlosSlug, 'Dr. Carlos Mendes', 'active'],
    )

    const carlosTenant = await db('tenants').where({ slug: carlosSlug }).first()
    const carlosTenantId: string = carlosTenant.id

    const carlosPasswordHash = await bcrypt.hash('Doctor123!', 10)

    await db.raw(
      `INSERT INTO doctors
         (tenant_id, email, password_hash, name, crm, crm_state, specialty,
          working_hours, onboarding_completed, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (email) DO NOTHING`,
      [
        carlosTenantId,
        'carlos.mendes@nocrato.com',
        carlosPasswordHash,
        'Dr. Carlos Mendes',
        null,
        null,
        null,
        null,
        false,
        'active',
      ],
    )

    await db.raw(
      `INSERT INTO agent_settings
         (tenant_id, enabled, booking_mode, welcome_message)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [carlosTenantId, false, 'link', null],
    )

    counts.tenants += 1
    counts.doctors += 1
    counts.agent_settings += 1

    // ── 4. Pacientes (tenant da Dra. Ana) ─────────────────────────────────────
    const patientsData = [
      { name: 'Maria Santos',   phone: '+5511888880001', source: 'manual',         code: 'SEED01' },
      { name: 'João Oliveira',  phone: '+5511888880002', source: 'manual',         code: 'SEED02' },
      { name: 'Fernanda Costa', phone: '+5511888880003', source: 'whatsapp_agent', code: 'SEED03' },
      { name: 'Roberto Lima',   phone: '+5511888880004', source: 'manual',         code: 'SEED04' },
      { name: 'Patrícia Souza', phone: '+5511888880005', source: 'whatsapp_agent', code: 'SEED05' },
    ]

    for (const p of patientsData) {
      await db.raw(
        `INSERT INTO patients
           (tenant_id, name, phone, source, status, portal_access_code, portal_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, phone) DO NOTHING`,
        [anaTenantId, p.name, p.phone, p.source, 'active', p.code, true],
      )
    }

    // Buscar IDs dos pacientes pelo telefone (idempotente)
    const patientRows = await db('patients')
      .where({ tenant_id: anaTenantId })
      .whereIn('phone', patientsData.map((p) => p.phone))
      .select('id', 'phone')

    counts.patients = patientRows.length

    const patientId = (phone: string): string => {
      const row = patientRows.find((r: { id: string; phone: string }) => r.phone === phone)
      if (!row) throw new Error(`Paciente não encontrado para telefone ${phone}`)
      return row.id
    }

    const p1 = patientId('+5511888880001') // Maria Santos
    const p2 = patientId('+5511888880002') // João Oliveira
    const p3 = patientId('+5511888880003') // Fernanda Costa
    const p4 = patientId('+5511888880004') // Roberto Lima
    const p5 = patientId('+5511888880005') // Patrícia Souza

    // ── 5. Consultas (10, tenant da Dra. Ana) ────────────────────────────────
    //
    // Regra de idempotência: ON CONFLICT não é viável aqui porque appointments
    // não tem unique constraint natural. Usamos a combinação (tenant_id, patient_id,
    // date_time) como chave de conflito natural para idempotência.
    //
    // A tabela tem índice idx_appointments_tenant_patient_date mas sem UNIQUE
    // constraint declarada. Usamos INSERT ... WHERE NOT EXISTS para cada linha.

    type AppointmentInsert = {
      tenant_id: string
      patient_id: string
      date_time: string
      status: string
      duration_minutes: number
      created_by: string
      cancellation_reason?: string | null
      started_at?: string | null
      completed_at?: string | null
    }

    const appointmentsData: AppointmentInsert[] = [
      // 3x completed (passado: -30d, -15d, -7d) — patients 1, 2, 3
      {
        tenant_id: anaTenantId, patient_id: p1,
        date_time: daysAgo(30), status: 'completed', duration_minutes: 30, created_by: 'doctor',
        started_at: daysAgo(30), completed_at: daysAgo(30),
      },
      {
        tenant_id: anaTenantId, patient_id: p2,
        date_time: daysAgo(15), status: 'completed', duration_minutes: 30, created_by: 'doctor',
        started_at: daysAgo(15), completed_at: daysAgo(15),
      },
      {
        tenant_id: anaTenantId, patient_id: p3,
        date_time: daysAgo(7), status: 'completed', duration_minutes: 30, created_by: 'doctor',
        started_at: daysAgo(7), completed_at: daysAgo(7),
      },
      // 2x in_progress (hoje -1h) — patients 1, 4
      {
        tenant_id: anaTenantId, patient_id: p1,
        date_time: hoursAgo(1), status: 'in_progress', duration_minutes: 30, created_by: 'doctor',
        started_at: hoursAgo(1),
      },
      {
        tenant_id: anaTenantId, patient_id: p4,
        date_time: hoursAgo(1), status: 'in_progress', duration_minutes: 30, created_by: 'doctor',
        started_at: hoursAgo(1),
      },
      // 2x scheduled (futuro: +1d, +3d) — patients 2, 5
      {
        tenant_id: anaTenantId, patient_id: p2,
        date_time: daysFromNow(1), status: 'scheduled', duration_minutes: 30, created_by: 'doctor',
      },
      {
        tenant_id: anaTenantId, patient_id: p5,
        date_time: daysFromNow(3), status: 'scheduled', duration_minutes: 30, created_by: 'doctor',
      },
      // 1x waiting (hoje -30min) — patient 3
      {
        tenant_id: anaTenantId, patient_id: p3,
        date_time: minutesAgo(30), status: 'waiting', duration_minutes: 30, created_by: 'doctor',
      },
      // 1x rescheduled (passado: -5d) — patient 4
      {
        tenant_id: anaTenantId, patient_id: p4,
        date_time: daysAgo(5), status: 'rescheduled', duration_minutes: 30, created_by: 'doctor',
        cancellation_reason: 'Paciente solicitou remarcação',
      },
      // 1x cancelled (passado: -10d) — patient 5
      {
        tenant_id: anaTenantId, patient_id: p5,
        date_time: daysAgo(10), status: 'cancelled', duration_minutes: 30, created_by: 'doctor',
        cancellation_reason: 'Paciente cancelou por motivo pessoal',
      },
    ]

    const insertedAppointmentIds: string[] = []

    for (const appt of appointmentsData) {
      // Verificar se já existe pela combinação (tenant_id, patient_id, date_time)
      const existing = await db('appointments')
        .where({
          tenant_id: appt.tenant_id,
          patient_id: appt.patient_id,
          status: appt.status,
        })
        .andWhere('date_time', '>=', new Date(new Date(appt.date_time).getTime() - 60000).toISOString())
        .andWhere('date_time', '<=', new Date(new Date(appt.date_time).getTime() + 60000).toISOString())
        .first()

      if (existing) {
        insertedAppointmentIds.push(existing.id as string)
      } else {
        const [inserted] = await db('appointments')
          .insert(appt)
          .returning('id')
        insertedAppointmentIds.push(inserted.id as string)
        counts.appointments += 1
      }
    }

    // IDs das 3 primeiras consultas completed (índices 0, 1, 2 = patients 1, 2, 3)
    const [appt1Id, appt2Id, appt3Id] = insertedAppointmentIds

    // ── 6. Notas clínicas (3) — uma por consulta completed ───────────────────
    const notesData = [
      {
        tenant_id: anaTenantId, patient_id: p1, appointment_id: appt1Id,
        content: 'Paciente relatou melhora dos sintomas após início do tratamento. Pressão arterial 120/80 mmHg. Manter medicação atual e retornar em 30 dias.',
      },
      {
        tenant_id: anaTenantId, patient_id: p2, appointment_id: appt2Id,
        content: 'Consulta de rotina. Exames laboratoriais dentro dos parâmetros normais. Paciente em bom estado geral. Solicitar novo hemograma em 6 meses.',
      },
      {
        tenant_id: anaTenantId, patient_id: p3, appointment_id: appt3Id,
        content: 'Paciente apresentou queixa de cefaleia recorrente. Sem sinais de alarme. Orientado sobre higiene do sono e hidratação. Prescrição de analgésico conforme necessidade.',
      },
    ]

    const encKey = process.env.DOCUMENT_ENCRYPTION_KEY
    if (!encKey) {
      throw new Error('DOCUMENT_ENCRYPTION_KEY is required to seed clinical_notes (content is BYTEA encrypted)')
    }
    for (const note of notesData) {
      // Idempotência: verificar por (appointment_id, patient_id)
      const existingNote = await db('clinical_notes')
        .where({ appointment_id: note.appointment_id, patient_id: note.patient_id })
        .first()

      if (!existingNote) {
        await db('clinical_notes').insert({
          tenant_id: note.tenant_id,
          patient_id: note.patient_id,
          appointment_id: note.appointment_id,
          content: db.raw('pgp_sym_encrypt(?, ?)', [note.content, encKey]),
        })
        counts.clinical_notes += 1
      }
    }

    // ── 7. Documentos (2) — patients 1 e 2, type=prescription ────────────────
    const documentsData = [
      {
        tenant_id: anaTenantId,
        patient_id: p1,
        appointment_id: null,
        type: 'prescription',
        file_url: `/uploads/${anaTenantId}/receita_maria_santos.pdf`,
        file_name: 'receita_maria_santos.pdf',
        mime_type: 'application/pdf',
        description: 'Receita de anti-hipertensivo — válida por 30 dias',
      },
      {
        tenant_id: anaTenantId,
        patient_id: p2,
        appointment_id: null,
        type: 'prescription',
        file_url: `/uploads/${anaTenantId}/receita_joao_oliveira.pdf`,
        file_name: 'receita_joao_oliveira.pdf',
        mime_type: 'application/pdf',
        description: 'Solicitação de exames laboratoriais de rotina',
      },
    ]

    for (const doc of documentsData) {
      // Idempotência: verificar por (tenant_id, patient_id, file_name)
      const existingDoc = await db('documents')
        .where({ tenant_id: doc.tenant_id, patient_id: doc.patient_id, file_name: doc.file_name })
        .first()

      if (!existingDoc) {
        await db('documents').insert(doc)
        counts.documents += 1
      }
    }

    // ── 8. Booking token (tenant Dra. Ana, phone do paciente 1) ──────────────
    const seedToken = 'seed-booking-token-0000000000000000000000000000000000000'
    const existingToken = await db('booking_tokens').where({ token: seedToken }).first()
    if (!existingToken) {
      await db('booking_tokens').insert({
        tenant_id: anaTenantId,
        token: seedToken,
        phone: '+5511888880001',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        used: false,
      })
    }

    // ── 9. Conversa de exemplo (tenant Dra. Ana, phone do paciente 3) ────────
    const sampleMessages = JSON.stringify([
      { role: 'user',      content: 'Olá, gostaria de agendar uma consulta.',           timestamp: hoursAgo(2) },
      { role: 'assistant', content: 'Olá! Claro, que dia você prefere?',                timestamp: hoursAgo(2) },
      { role: 'user',      content: 'Semana que vem, de manhã.',                         timestamp: hoursAgo(2) },
      { role: 'assistant', content: 'Vou verificar os horários disponíveis para você!',  timestamp: hoursAgo(2) },
    ])
    await db.raw(
      `INSERT INTO conversations (tenant_id, phone, messages, last_message_at)
       VALUES (?, ?, ?::jsonb, ?)
       ON CONFLICT (tenant_id, phone) DO NOTHING`,
      [anaTenantId, '+5511888880003', sampleMessages, hoursAgo(2)],
    )

    // ── Log final ─────────────────────────────────────────────────────────────
    console.log('\nSeed concluido. Registros inseridos nesta execucao:')
    console.log(`  agency_members : ${counts.agency_members}`)
    console.log(`  tenants        : ${counts.tenants}`)
    console.log(`  doctors        : ${counts.doctors}`)
    console.log(`  agent_settings : ${counts.agent_settings}`)
    console.log(`  patients       : ${counts.patients}`)
    console.log(`  appointments   : ${counts.appointments}`)
    console.log(`  clinical_notes : ${counts.clinical_notes}`)
    console.log(`  documents      : ${counts.documents}`)
    console.log('\nDados de acesso:')
    console.log('  admin@nocrato.com         / admin123')
    console.log('  ana.silva@nocrato.com     / Doctor123!  (onboarding completo, slug: dr-ana-silva)')
    console.log('  carlos.mendes@nocrato.com / Doctor123!  (onboarding incompleto, slug: dr-carlos-mendes)')
    console.log('\nCodigos de acesso portal paciente: SEED01 a SEED05')
    console.log('\nBooking token (valido 24h):')
    console.log('  /book/dr-ana-silva?token=seed-booking-token-0000000000000000000000000000000000000')
    console.log('\nEvolution instance da Dra. Ana: dr-ana-silva-instance')
  } finally {
    await db.destroy()
  }
}

runSeed().catch((err) => {
  console.error('Erro ao rodar seed:', err)
  process.exit(1)
})
