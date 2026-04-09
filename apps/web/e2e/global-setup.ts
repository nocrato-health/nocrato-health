import { execSync } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

async function globalSetup() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const apiRoot = path.resolve(__dirname, '../../../apps/api')

  // setup-test-data.ts tem guard `NODE_ENV !== 'test'` — garantimos aqui,
  // independentemente do env do shell que invocou o Playwright. Também
  // propaga E2E_THROTTLE_BYPASS_SECRET para specs que chamam a API via
  // request context no beforeAll.
  execSync('node_modules/.bin/ts-node src/database/setup-test-data.ts', {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  })
}

export default globalSetup
