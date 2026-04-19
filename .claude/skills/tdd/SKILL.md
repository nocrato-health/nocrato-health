# Skill: Test-Driven Development

Red-Green-Refactor. Sem exceções.

Inspirado no Superpowers TDD skill. Adaptado pro stack Nocrato Health (Jest + NestJS + Knex).

---

## Quando usar

- Toda feature nova (backend ou frontend)
- Todo bugfix
- Todo refactor que muda comportamento

## Quando NÃO usar (perguntar ao usuário)

- Protótipos descartáveis
- Configuração pura (env, docker-compose)
- Mudanças cosméticas sem lógica

---

## A Lei de Ferro

```
NENHUM CÓDIGO DE PRODUÇÃO SEM TESTE FALHANDO PRIMEIRO.
```

Escreveu código antes do teste? Deletar. Recomeçar do teste. Sem exceções:
- Não manter como "referência"
- Não "adaptar" enquanto escreve o teste
- Deletar significa deletar

---

## Red-Green-Refactor

### RED — Escrever teste que falha

```typescript
// Um teste, um comportamento, nome claro
it('deve retornar 404 quando paciente não existe', async () => {
  mockKnex.mockResolvedValue(null)
  await expect(service.getPatient('tenant-1', 'non-existent'))
    .rejects.toThrow(NotFoundException)
})
```

Rodar: `npx jest --testPathPattern=patient --no-coverage`
Esperado: **FAIL**

### GREEN — Implementar mínimo pra passar

```typescript
async getPatient(tenantId: string, id: string) {
  const patient = await this.knex('patients')
    .where({ id, tenant_id: tenantId }).first()
  if (!patient) throw new NotFoundException('Paciente não encontrado')
  return patient
}
```

Rodar: `npx jest --testPathPattern=patient --no-coverage`
Esperado: **PASS**

### REFACTOR — Limpar sem mudar comportamento

- Extrair constantes, renomear variáveis, simplificar
- Rodar testes após cada mudança — **devem continuar passando**
- Se quebraram: desfazer refactor, não corrigir o teste

### COMMIT

```bash
git add apps/api/src/modules/patient/
git commit -m "feat(patients): add getPatient with 404 handling"
```

---

## Padrões de mock Nocrato Health

### Spec setup obrigatório

```typescript
// SEMPRE antes de qualquer import
jest.mock('@/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-16-chars',
    // ... demais vars
    DOCUMENT_ENCRYPTION_KEY: 'a'.repeat(64),
  },
}))
```

### Mock Knex

```typescript
// Métodos encadeáveis: mockReturnThis()
// Métodos terminais: mockResolvedValue()
const mockKnex = Object.assign(jest.fn(), {
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
  raw: jest.fn().mockReturnValue('raw_stub'),
})
```

### Mock transação

```typescript
const mockTrx = Object.assign(jest.fn(), {
  // ... mocks por tabela via mockImplementation
  commit: jest.fn(),
  rollback: jest.fn(),
  raw: jest.fn().mockReturnValue('trx_raw_stub'),
})
```

---

## Red Flags — PARAR

Se você se pegar pensando:
- "Pulo o teste só dessa vez"
- "Primeiro codifico, depois testo"
- "É simples demais pra testar"
- "Teste depois de funcionar"

**TODAS significam: PARAR. Voltar pro RED.**

---

## Rationalizations comuns

| Desculpa | Realidade |
|----------|---------|
| "Issue é simples, não precisa TDD" | Issues simples têm causa raiz. TDD é rápido pra issues simples. |
| "Emergência, sem tempo" | TDD é MAIS RÁPIDO que trial-and-error. |
| "Vou testar depois" | "Depois" nunca chega. E o teste fica fraco. |
| "Múltiplos testes de uma vez" | Não sabe qual cobre o quê. Um por vez. |
