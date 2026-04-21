# CLAUDE.md — Módulo health

## Responsabilidade

Endpoint de health check para verificação de disponibilidade da API e conectividade com o banco de dados. Usado por Docker, Nginx e futuros monitores externos.

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `health.controller.ts` | `GET /health` — executa `SELECT 1` no banco e retorna `{ status: 'ok', timestamp }` |

## Regras de negócio

- Rota pública (sem guard de autenticação)
- Se o banco estiver inacessível, a query lança exceção → resposta 500 automática pelo NestJS
- Retorna `{ status: 'ok', timestamp: ISO string }` em caso de sucesso

## O que NÃO pertence a este módulo

- Métricas de performance ou observabilidade → futuro (V2)
- Health check de serviços externos (Resend, Meta Cloud API) → fora do MVP

## Como testar isoladamente

```bash
curl http://localhost:3000/health
# Esperado: { "status": "ok", "timestamp": "..." }
```
