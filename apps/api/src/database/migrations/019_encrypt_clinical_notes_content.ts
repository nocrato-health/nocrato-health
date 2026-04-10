import type { Knex } from 'knex'

/**
 * 019_encrypt_clinical_notes_content.ts — LGPD Fase 0
 *
 * Substitui `clinical_notes.content` (TEXT plaintext) por `clinical_notes.content`
 * (BYTEA criptografado via pgcrypto AES-256).
 *
 * ⚠️  DESTRUTIVA EM AMBAS AS DIREÇÕES:
 * - `up()` dropa a coluna `content` TEXT e recria como BYTEA. Dados existentes
 *   são perdidos. Confirmado OK: 12 notas em dev, banco de prod vazio.
 * - `down()` dropa BYTEA e recria como TEXT. Rollback NÃO recupera dados
 *   criptografados. Após deploy em produção com dados reais, rollback não é
 *   mais viável — migrações de compensação seriam necessárias.
 *
 * A chave AES para encrypt/decrypt fica em `env.DOCUMENT_ENCRYPTION_KEY`,
 * nunca no banco. Mesma chave usada para patients.document (migration 018).
 * Perda da chave = perda permanente de acesso aos dados criptografados.
 */
export async function up(knex: Knex): Promise<void> {
  // pgcrypto já habilitado na migration 018 — garantir extensão presente
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)

  await knex.raw(`ALTER TABLE clinical_notes DROP COLUMN IF EXISTS content;`)

  await knex.raw(`ALTER TABLE clinical_notes ADD COLUMN content BYTEA NOT NULL DEFAULT '';`)

  // Remover o DEFAULT — era apenas para satisfazer NOT NULL no ALTER em tabela com linhas.
  // Em produção a tabela está vazia; em dev as 12 linhas são perdidas (confirmado OK).
  await knex.raw(`ALTER TABLE clinical_notes ALTER COLUMN content DROP DEFAULT;`)

  await knex.raw(`
    COMMENT ON COLUMN clinical_notes.content IS
      'Nota clínica criptografada via pgcrypto (AES-256). Decrypt com a chave DOCUMENT_ENCRYPTION_KEY do env. LGPD Fase 0.';
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE clinical_notes DROP COLUMN IF EXISTS content;`)

  await knex.raw(`ALTER TABLE clinical_notes ADD COLUMN content TEXT NOT NULL DEFAULT '';`)

  await knex.raw(`ALTER TABLE clinical_notes ALTER COLUMN content DROP DEFAULT;`)

  await knex.raw(`
    COMMENT ON COLUMN clinical_notes.content IS
      'Free-form clinical note. Always authored by the doctor.';
  `)
}
