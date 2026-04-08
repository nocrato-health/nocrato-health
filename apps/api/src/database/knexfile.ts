import type { Knex } from 'knex'
import * as dotenv from 'dotenv'
import * as path from 'path'

if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env.test') })
}
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

const config: Knex.Config = {
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
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
}

export default config
module.exports = config
