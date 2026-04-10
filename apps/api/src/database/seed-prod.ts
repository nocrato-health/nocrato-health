import knex from 'knex'
import bcrypt from 'bcrypt'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

/**
 * seed-prod.ts — Seed mínimo para produção
 *
 * Cria APENAS o agency_admin inicial com credenciais do .env.
 * Nenhum dado fictício, nenhum doutor/paciente/consulta.
 *
 * Variáveis obrigatórias no .env:
 *   ADMIN_EMAIL    — email do admin (ex: pedro@nocrato.com)
 *   ADMIN_PASSWORD — senha forte em plaintext (hash gerado pelo script)
 *
 * Idempotente: ON CONFLICT DO NOTHING — rodar 2x não duplica.
 * Não sobrescreve senha se o admin já existir.
 */

async function runSeedProd() {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminEmail || !adminPassword) {
    console.error('ERRO: ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios no .env para seed de produção.')
    console.error('Exemplo:')
    console.error('  ADMIN_EMAIL=pedro@nocrato.com')
    console.error('  ADMIN_PASSWORD=SuaSenhaForte!2026')
    process.exit(1)
  }

  if (adminPassword.length < 8) {
    console.error('ERRO: ADMIN_PASSWORD deve ter no mínimo 8 caracteres.')
    process.exit(1)
  }

  const db = knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'nocrato_health',
      user: process.env.DB_USER ?? 'nocrato',
      password: process.env.DB_PASSWORD ?? '',
    },
  })

  try {
    const passwordHash = await bcrypt.hash(adminPassword, 10)

    await db.raw(
      `INSERT INTO agency_members (email, password_hash, name, role, status)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO NOTHING`,
      [adminEmail, passwordHash, 'Admin', 'agency_admin', 'active'],
    )

    // Verificar se inseriu ou já existia
    const admin = await db('agency_members').where({ email: adminEmail }).first()
    if (admin) {
      console.log(`\nSeed prod concluído.`)
      console.log(`  Admin: ${adminEmail}`)
      console.log(`  Status: ${admin.last_login_at ? 'já existia (senha NÃO alterada)' : 'criado agora'}`)
      console.log(`\nPróximos passos:`)
      console.log(`  1. Logar no portal da agência com as credenciais acima`)
      console.log(`  2. Criar convites para os doutores via UI`)
      console.log(`  3. (Opcional) Remover ADMIN_PASSWORD do .env após primeiro login`)
    }
  } finally {
    await db.destroy()
  }
}

runSeedProd().catch((err) => {
  console.error('Erro ao rodar seed prod:', err)
  process.exit(1)
})
