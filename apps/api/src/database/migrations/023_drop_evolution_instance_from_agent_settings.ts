import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    -- Remove Evolution API instance name column from agent_settings.
    -- O projeto migrou para Meta Cloud API exclusivamente (refactor remove-evolution-api).
    -- A coluna evolution_instance_name e seu índice único parcial não têm mais utilidade.

    DROP INDEX IF EXISTS idx_agent_settings_evolution_instance;

    ALTER TABLE agent_settings
      DROP COLUMN IF EXISTS evolution_instance_name;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE agent_settings
      ADD COLUMN evolution_instance_name VARCHAR(100) NULL;

    COMMENT ON COLUMN agent_settings.evolution_instance_name IS
      'Nome da instância Evolution API configurada por este tenant. NULL para doutores que ainda não configuraram. Usado para resolver tenant_id a partir do webhook.';

    CREATE UNIQUE INDEX idx_agent_settings_evolution_instance
      ON agent_settings (evolution_instance_name)
      WHERE evolution_instance_name IS NOT NULL;
  `)
}
