import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // 1. Criar tabela patient_consents (LGPD Art. 7º)
  await knex.schema.createTable('patient_consents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table
      .uuid('tenant_id')
      .notNullable()
      .references('id')
      .inTable('tenants')
      .onDelete('CASCADE')
    table
      .uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable('patients')
      .onDelete('CASCADE')
    table.string('consent_type', 50).notNullable()
    table.string('consent_version', 20).notNullable().defaultTo('1.0')
    table.timestamp('accepted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.string('ip_address', 45).nullable()
    table.text('user_agent').nullable()
    table.string('source', 50).notNullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  // CHECK constraints
  await knex.raw(`
    ALTER TABLE patient_consents
    ADD CONSTRAINT patient_consents_type_check
    CHECK (consent_type IN ('privacy_policy', 'data_processing'))
  `)

  await knex.raw(`
    ALTER TABLE patient_consents
    ADD CONSTRAINT patient_consents_source_check
    CHECK (source IN ('booking', 'patient_portal', 'whatsapp_agent'))
  `)

  // Indexes
  await knex.raw(`
    CREATE INDEX idx_patient_consents_tenant_patient
    ON patient_consents (tenant_id, patient_id)
  `)

  await knex.raw(`
    CREATE INDEX idx_patient_consents_type_version
    ON patient_consents (consent_type, consent_version)
  `)

  // 2. Adicionar deletion_requested_at à tabela patients (LGPD Art. 18, V)
  await knex.schema.alterTable('patients', (table) => {
    table
      .timestamp('deletion_requested_at', { useTz: true })
      .nullable()
      .comment(
        'LGPD Art. 18, V: timestamp de quando o paciente solicitou exclusão de dados. NULL = sem solicitação.',
      )
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('patients', (table) => {
    table.dropColumn('deletion_requested_at')
  })

  await knex.schema.dropTableIfExists('patient_consents')
}
