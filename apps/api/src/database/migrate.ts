import knex from 'knex'
import * as dotenv from 'dotenv'
import * as path from 'path'

if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env.test') })
}
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

// Em NODE_ENV=test, proibir fallbacks — se o dotenv falhar silenciosamente
// (ex: path errado), o default cai no banco de dev e contamina. Foi o bug
// que mascarou o erro de 4 níveis de path neste arquivo. Em dev/prod mantém
// os defaults para não quebrar devs com .env parcial.
function requireDbEnv(key: string): string {
  const value = process.env[key]
  if (!value && process.env.NODE_ENV === 'test') {
    throw new Error(
      `${key} ausente com NODE_ENV=test — verifique .env.test e o path do dotenv neste arquivo.`,
    )
  }
  return value ?? ''
}

// Em produção (dist/), as migrations são compiladas para .js
// Em desenvolvimento (src/), ts-node carrega .ts via pnpm migrate
const isCompiled = __filename.endsWith('.js')
const migrationsExt = isCompiled ? 'js' : 'ts'
const migrationsLoadExt = isCompiled ? ['.js'] : ['.ts']

async function runMigrations() {
  const db = knex({
    client: 'pg',
    connection: {
      host: requireDbEnv('DB_HOST') || 'localhost',
      port: Number(requireDbEnv('DB_PORT') || 5432),
      database: requireDbEnv('DB_NAME') || 'nocrato_health',
      user: requireDbEnv('DB_USER') || 'nocrato',
      password: requireDbEnv('DB_PASSWORD') || 'nocrato_secret',
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations'),
      extension: migrationsExt,
      loadExtensions: migrationsLoadExt,
    },
  })

  try {
    console.log('🔄 Rodando migrations...')
    const [batch, migrations] = await db.migrate.latest()

    if (migrations.length === 0) {
      console.log('✅ Banco já está na versão mais recente.')
    } else {
      console.log(`✅ Batch ${batch} — ${migrations.length} migration(s) aplicada(s):`)
      migrations.forEach((m: string) => console.log(`   - ${m}`))
    }
  } finally {
    await db.destroy()
  }
}

runMigrations().catch((err) => {
  console.error('❌ Erro ao rodar migrations:', err)
  process.exit(1)
})
