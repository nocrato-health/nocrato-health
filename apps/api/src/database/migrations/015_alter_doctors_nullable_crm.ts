import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    -- BUG-01: crm e crm_state eram NOT NULL sem DEFAULT — aceite de convite lançava violação de constraint
    ALTER TABLE doctors ALTER COLUMN crm DROP NOT NULL;
    ALTER TABLE doctors ALTER COLUMN crm_state DROP NOT NULL;

    -- BUG-02: working_hours DEFAULT '{}' causava falso positivo em Boolean check (Boolean('{}') === true)
    -- UPDATE deve preceder o ALTER DEFAULT para limpar registros existentes com valor sentinela
    UPDATE doctors SET working_hours = NULL WHERE working_hours = '{}';
    ALTER TABLE doctors ALTER COLUMN working_hours SET DEFAULT NULL;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    -- Reverter BUG-02
    UPDATE doctors SET working_hours = '{}' WHERE working_hours IS NULL;
    ALTER TABLE doctors ALTER COLUMN working_hours SET DEFAULT '{}';

    -- Reverter BUG-01 (NOT NULL requer que não haja NULLs — usar valores sentinela)
    UPDATE doctors SET crm = '' WHERE crm IS NULL;
    UPDATE doctors SET crm_state = 'SP' WHERE crm_state IS NULL;
    ALTER TABLE doctors ALTER COLUMN crm SET NOT NULL;
    ALTER TABLE doctors ALTER COLUMN crm_state SET NOT NULL;
  `)
}
