---
id: 002
title: LoggingInterceptor global com redação automática de headers
surfaced_by: Code review do PR #14 (OBS-TL-1 do tech-lead)
surfaced_at: 2026-04-08
trigger: "Decisão de começar a logar requests HTTP estruturados (hoje não temos LoggingInterceptor)"
priority: defer
related_adrs: []
---

# LoggingInterceptor com redação de headers

## Contexto

Hoje o NestJS não tem nenhum interceptor global que loga requests. O único logging transversal é o `HttpExceptionFilter` (que já não dumpa request) e logs explícitos nos services (que passaram por SEC-11 — `redactPii`).

Quando decidirmos adicionar observabilidade de request/response (típico em APIs maduras — access log estruturado, latência por endpoint, body inspection em erros), vai ser necessário criar um `LoggingInterceptor`. Nesse momento, temos que lembrar de **redatar headers sensíveis** — senão PII vaza por outro caminho que SEC-11 não cobriu.

Headers críticos a redatar:
- `Authorization` (Bearer tokens)
- `Cookie`
- `x-e2e-bypass` (secret de bypass do throttler — ADR-017 item 7 implicito, TD-29)
- `x-forwarded-for` se a API guardar IPs (LGPD)
- Qualquer header customizado futuro que carregue token

## Proposta

Ao criar o interceptor:

```typescript
const SENSITIVE_HEADERS = [
  'authorization', 'cookie', 'x-e2e-bypass',
  'x-forwarded-for', 'x-real-ip', 'set-cookie',
]

function redactHeaders(headers: Record<string, string>) {
  const out = { ...headers }
  for (const k of SENSITIVE_HEADERS) {
    if (out[k]) out[k] = '[REDACTED]'
  }
  return out
}
```

Idealmente, integrar com o utilitário existente `redactPii()` em `apps/api/src/common/logging/redact-pii.ts` — adicionar os headers à allowlist do `redactPii`, e o interceptor chama `redactPii(request.headers)` em vez de lista custom.

## Custo estimado

2-4h: criar interceptor, registrar em `main.ts`, ajustar `redactPii` pra incluir headers HTTP, adicionar 4-6 testes unitários.

## Riscos de NÃO fazer

Baixo enquanto não logarmos requests. **Alto se alguém adicionar um LoggingInterceptor sem lembrar de redatar** — vaza tokens de auth pra Bugsink/Sentry automaticamente, virando um CVE funcional.

## Alternativas consideradas

- Bloquear PRs que adicionam `LoggingInterceptor` sem redação via pre-commit hook: overkill pra um cenário que ainda não existe
- Documentar só em comentário: menos eficaz que uma seed acionável

## Observação

Essa seed é basicamente um "lembrete pro futuro eu". Pode viver aqui indefinidamente sem custo. Se a Fase 1 ou Fase 2 de observabilidade decidir usar structured logging (pino, winston), essa seed vira ação direta.
