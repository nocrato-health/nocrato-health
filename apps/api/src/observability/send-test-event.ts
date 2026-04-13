/**
 * send-test-event.ts
 *
 * Script standalone para validar a integração Bugsink + redactPii.
 * Dispara um Sentry.captureException com PII embutida e aguarda o flush
 * pra garantir que o evento chegou ao Bugsink antes do processo morrer.
 *
 * Uso:
 *   NODE_ENV=development pnpm --filter @nocrato/api exec \
 *     ts-node -r tsconfig-paths/register src/observability/send-test-event.ts
 *
 * Validação esperada:
 * - Evento aparece no Bugsink (http://localhost:8000) no projeto nocrato-api
 * - Stack trace / mensagem tem:
 *   - email → "j***@***" (não "joao@silva.com.br")
 *   - telefone → "****5432" (não "(11) 99876-5432")
 *   - CPF → "***.***.***-**" (não "123.456.789-00")
 * - Tags: environment=development
 *
 * Remover o arquivo após validação (não faz parte do runtime de produção).
 */
import { initSentry, Sentry } from './sentry'

async function main() {
  initSentry()

  // Simula um erro de produção com PII interpolada na mensagem — o pior caso
  // que o redactPii precisa pegar.
  const fakeError = new Error(
    'Falha ao processar paciente joao@silva.com.br telefone (11) 99876-5432 CPF 123.456.789-00',
  )

  const eventId = Sentry.captureException(fakeError, {
    tags: {
      test: 'sec-11-validation',
      source: 'send-test-event-script',
    },
    extra: {
      // Também testa redação em objeto estruturado (allowlist de chaves).
      email: 'doctor@clinic.com',
      phone: '11988887777',
      portal_access_code: 'MRS-1234-PAC',
      token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.fake',
      tenantId: 'b8c2e1a4-1234-5678-9abc-def012345678', // UUID — NÃO é PII, deve passar intacto
    },
  })

  console.log(`✓ Evento enviado ao Bugsink. Event ID: ${eventId}`)
  console.log('  Dando flush de 5s para garantir entrega...')

  // Aguarda o SDK terminar de enviar antes de matar o processo.
  const ok = await Sentry.flush(5000)
  console.log(ok ? '✓ Flush concluído.' : '✗ Flush timeout — evento pode não ter chegado.')

  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error('Falha no script de teste:', err)
  process.exit(1)
})
