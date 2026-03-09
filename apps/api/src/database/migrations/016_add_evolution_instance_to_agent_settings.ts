import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    -- TD-20: adicionar evolution_instance_name para resolver tenant por instância Evolution API.
    -- Cada doutor configura sua própria instância; a resolução do tenant passa a filtrar
    -- por evolution_instance_name em vez de ORDER BY updated_at DESC LIMIT 1.
    -- Nullable: doutores sem instância configurada não recebem mensagens do agente.
    ALTER TABLE agent_settings
      ADD COLUMN evolution_instance_name VARCHAR(100) NULL;

    -- Unique index: garante que dois tenants não usem a mesma instância Evolution.
    -- Lookup frequente (1 query por mensagem recebida via webhook).
    CREATE UNIQUE INDEX idx_agent_settings_evolution_instance
      ON agent_settings (evolution_instance_name)
      WHERE evolution_instance_name IS NOT NULL;

    COMMENT ON COLUMN agent_settings.evolution_instance_name IS
      'Nome da instância Evolution API configurada por este tenant. NULL para doutores que ainda não configuraram. Usado para resolver tenant_id a partir do webhook.';
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_agent_settings_evolution_instance;
    ALTER TABLE agent_settings DROP COLUMN IF EXISTS evolution_instance_name;
  `)
}
