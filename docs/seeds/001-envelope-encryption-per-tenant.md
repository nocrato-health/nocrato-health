---
id: 001
title: Envelope encryption por tenant (substituir chave única simétrica)
surfaced_by: ADR-017 seção 1 (decisão LGPD Fase 0 — chave única simétrica)
surfaced_at: 2026-04-09
trigger: "5+ doutores ativos em produção OU requisito de compliance HIPAA/PCI/ISO 27001"
priority: post-scale
related_adrs: [ADR-017]
---

# Envelope encryption por tenant

## Contexto

Na Fase 0 LGPD decidimos usar uma **chave simétrica única** (`DOCUMENT_ENCRYPTION_KEY`) pra criptografar `patients.document` e futuramente `clinical_notes.content` via pgcrypto. A escolha foi consciente — registrada em ADR-017 seção 1 — e correta pro MVP com 1 doutor.

A limitação real:
- Vazamento da chave = todos os documentos de todos os tenants expostos
- Rotação da chave exige re-encriptar **todo o banco** de uma vez
- Não há compartimentação por cliente

Pra contextos com múltiplos clientes pagantes ou requisitos formais de compliance, isso é insuficiente.

## Proposta

Migrar pra **envelope encryption**:

1. **Master key** continua no env var (`MASTER_ENCRYPTION_KEY`), única
2. **Per-tenant data encryption keys (DEK)** armazenadas em nova tabela `tenant_encryption_keys`:
   - `tenant_id` UUID PK/FK
   - `dek_encrypted` bytea — a DEK criptografada **pela master key**
   - `created_at`, `rotated_at`
3. **Fluxo de encrypt**:
   - Buscar `dek_encrypted` do tenant
   - Decriptar com master key (cache em memória por alguns minutos)
   - Usar a DEK em plaintext pra criptografar o dado
4. **Rotação** fica viável:
   - **DEK rotation**: cria DEK nova, re-encripta apenas dados de um tenant (rápido)
   - **Master rotation**: re-encripta só as DEKs (trivial, poucos bytes)
5. **Vazamento de um tenant** não compromete os outros — isolamento criptográfico

## Custo estimado

1-2 sprints:
- Migration de schema (tabela nova + coluna em `patients`, `clinical_notes` etc pra indicar versão da chave)
- Refactor do service com cache de DEKs decriptadas (LRU + TTL)
- Processo de migração dos dados existentes
- KMS integration (futuro: mover master key pra AWS KMS / HashiCorp Vault em vez de env var)
- Testes de rotação
- Docs/ADR novo

## Riscos de NÃO fazer

Com 1-5 doutores, baixíssimo. A partir de ~10 tenants ativos ou após o primeiro cliente B2B exigir DPA formal com cláusula de isolamento criptográfico, vira requisito.

LGPD sozinha não exige envelope — chave única com controle de acesso ao VPS é aceitável.

## Alternativas consideradas

- **Hardware Security Module (HSM)**: overkill até ter muito volume e orçamento pra AWS CloudHSM ou equivalente
- **Chave por doutor (não por tenant)**: mesma complexidade mas menor valor agregado — tenant já é a unidade natural de isolamento
- **Criptografia client-side (paciente guarda parte da chave)**: inviável porque paciente precisa acesso read-only ao portal
