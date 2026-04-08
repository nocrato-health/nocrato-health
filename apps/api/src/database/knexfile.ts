import type { Knex } from 'knex'
import * as dotenv from 'dotenv'
import * as path from 'path'

if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env.test') })
}
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

// Em NODE_ENV=test, exigir que as vars venham do .env.test — fallback silencioso
// ao banco de dev foi o bug que mascarou path errado no dotenv. Ver migrate.ts.
function requireDbEnv(key: string): string {
  const value = process.env[key]
  if (!value && process.env.NODE_ENV === 'test') {
    throw new Error(
      `${key} ausente com NODE_ENV=test — verifique .env.test e o path do dotenv neste arquivo.`,
    )
  }
  return value ?? ''
}

const config: Knex.Config = {
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
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
}

export default config
module.exports = config
