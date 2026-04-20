import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('conversations', (table) => {
    table
      .string('mode', 20)
      .notNullable()
      .defaultTo('agent')
      .comment(
        "Handoff doutor↔agente. 'agent' = IA responde. 'human' = doutor assumiu (auto-detectado via fromMe).",
      )

    table
      .timestamp('last_fromme_at', { useTz: true })
      .nullable()
      .comment(
        'Timestamp da última msg fromMe=true. Auto-revert para agent após 30min sem atividade do doutor.',
      )
  })

  await knex.raw(`
    ALTER TABLE conversations
    ADD CONSTRAINT conversations_mode_check
    CHECK (mode IN ('agent', 'human'))
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_mode_check')

  await knex.schema.alterTable('conversations', (table) => {
    table.dropColumn('last_fromme_at')
    table.dropColumn('mode')
  })
}
