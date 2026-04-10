import type { Knex } from 'knex'

/**
 * 018_patients_document_pgcrypto.ts — LGPD Fase 0
 *
 * Substitui `patients.cpf` (varchar plaintext) por `patients.document` (bytea
 * criptografado via pgcrypto) + `patients.document_type` ('cpf' | 'rg').
 *
 * ⚠️  DESTRUTIVA EM AMBAS AS DIREÇÕES:
 * - `up()` dropa a coluna `cpf` sem backfill. Aplicado com zero CPFs em dev
 *   e banco de prod vazio — seguro na Fase 0 pré-produção.
 * - `down()` recria `cpf VARCHAR(14)` vazio. Rollback NÃO recupera dados
 *   originais (o ciphertext de `document` é descartado). Após deploy em
 *   produção com dados reais, rollback não é mais uma opção viável —
 *   migrações de compensação seriam necessárias.
 *
 * A chave AES para encrypt/decrypt fica em `env.DOCUMENT_ENCRYPTION_KEY`,
 * nunca no banco. Perda da chave = perda permanente de acesso aos dados
 * criptografados. Backup obrigatório em local separado do VPS.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)

  await knex.raw(`DROP INDEX IF EXISTS idx_patients_tenant_cpf;`)

  await knex.raw(`ALTER TABLE patients DROP COLUMN IF EXISTS cpf;`)

  await knex.raw(`ALTER TABLE patients ADD COLUMN document BYTEA NULL;`)

  await knex.raw(`ALTER TABLE patients ADD COLUMN document_type VARCHAR(10) NULL;`)

  await knex.raw(`
    ALTER TABLE patients
      ADD CONSTRAINT patients_document_type_check
        CHECK (document_type IN ('cpf', 'rg'));
  `)

  await knex.raw(`
    ALTER TABLE patients
      ADD CONSTRAINT patients_document_both_or_neither_check
        CHECK (
          (document IS NULL AND document_type IS NULL)
          OR
          (document IS NOT NULL AND document_type IS NOT NULL)
        );
  `)

  await knex.raw(`
    COMMENT ON COLUMN patients.document IS
      'Documento de identificação criptografado via pgcrypto (AES-256). Decrypt com a chave DOCUMENT_ENCRYPTION_KEY do env. LGPD Fase 0.';
  `)

  await knex.raw(`
    COMMENT ON COLUMN patients.document_type IS
      'Tipo do documento: cpf ou rg. Escolha do paciente no momento do cadastro.';
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE patients
      DROP CONSTRAINT IF EXISTS patients_document_both_or_neither_check;
  `)

  await knex.raw(`
    ALTER TABLE patients
      DROP CONSTRAINT IF EXISTS patients_document_type_check;
  `)

  await knex.raw(`ALTER TABLE patients DROP COLUMN IF EXISTS document_type;`)

  await knex.raw(`ALTER TABLE patients DROP COLUMN IF EXISTS document;`)

  await knex.raw(`ALTER TABLE patients ADD COLUMN cpf VARCHAR(14);`)

  await knex.raw(`
    CREATE INDEX idx_patients_tenant_cpf ON patients (tenant_id, cpf)
      WHERE cpf IS NOT NULL;
  `)

  // pgcrypto não é desinstalado — outras migrations podem usá-la
}
