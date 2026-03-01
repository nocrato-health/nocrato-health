import { execSync } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

async function globalSetup() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const apiRoot = path.resolve(__dirname, '../../../apps/api')

  execSync('node_modules/.bin/ts-node src/database/setup-test-data.ts', {
    cwd: apiRoot,
    stdio: 'inherit',
  })
}

export default globalSetup
