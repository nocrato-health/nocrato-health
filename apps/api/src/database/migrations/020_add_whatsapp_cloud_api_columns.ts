import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('agent_settings', (table) => {
    table
      .string('whatsapp_phone_number_id', 50)
      .nullable()
      .comment(
        'ID do número de telefone na Meta (Cloud API). NULL para doutores que usam Evolution API.',
      )

    table
      .string('whatsapp_waba_id', 50)
      .nullable()
      .comment(
        'WhatsApp Business Account ID do doutor na Meta. Obtido via debug_token no Embedded Signup.',
      )

    table
      .string('whatsapp_display_phone_number', 20)
      .nullable()
      .comment('Número formatado para exibição, ex: +5511988887777')

    table
      .string('whatsapp_verified_name', 255)
      .nullable()
      .comment('Nome verificado do negócio na Meta.')
  })

  // Index único parcial para roteamento do webhook Cloud API:
  // cada phone_number_id identifica exatamente 1 tenant.
  await knex.raw(`
    CREATE UNIQUE INDEX idx_agent_settings_cloud_phone_number_id
    ON agent_settings (whatsapp_phone_number_id)
    WHERE whatsapp_phone_number_id IS NOT NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    'DROP INDEX IF EXISTS idx_agent_settings_cloud_phone_number_id',
  )

  await knex.schema.alterTable('agent_settings', (table) => {
    table.dropColumn('whatsapp_phone_number_id')
    table.dropColumn('whatsapp_waba_id')
    table.dropColumn('whatsapp_display_phone_number')
    table.dropColumn('whatsapp_verified_name')
  })
}
