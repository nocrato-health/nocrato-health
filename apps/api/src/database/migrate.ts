import knex from 'knex'
import * as dotenv from 'dotenv'
import * as path from 'path'

if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env.test') })
}
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

// Em produção (dist/), as migrations são compiladas para .js
// Em desenvolvimento (src/), ts-node carrega .ts via pnpm migrate
const isCompiled = __filename.endsWith('.js')
const migrationsExt = isCompiled ? 'js' : 'ts'
const migrationsLoadExt = isCompiled ? ['.js'] : ['.ts']

async function runMigrations() {
  const db = knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'nocrato_health',
      user: process.env.DB_USER ?? 'nocrato',
      password: process.env.DB_PASSWORD ?? 'nocrato_secret',
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
