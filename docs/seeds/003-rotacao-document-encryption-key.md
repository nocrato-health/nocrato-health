---
id: 003
title: Processo de rotação da DOCUMENT_ENCRYPTION_KEY
surfaced_by: ADR-017 seção 1 (MVP aceita rotação manual pós-escala)
surfaced_at: 2026-04-09
trigger: "Chave comprometida (vazamento) OU chave ativa em prod há mais de 12 meses OU migração pra envelope encryption (seed 001)"
priority: post-pilot
related_adrs: [ADR-017]
---

# Rotação da DOCUMENT_ENCRYPTION_KEY

## Contexto

A chave simétrica única usada pra criptografar `patients.document` (e futuramente `clinical_notes.content`) vive em `env.DOCUMENT_ENCRYPTION_KEY`. Hoje ela é:

- Gerada uma vez com `openssl rand -hex 32`
- Nunca rotacionada
- Backup manual fora do VPS (responsabilidade do usuário)

Registrado em ADR-017 como "rotação não suportada no MVP — débito pós-escala".

## Proposta

Processo documentado em `docs/guides/encryption-key-rotation.md` cobrindo:

1. **Preparação**:
   - Gerar nova chave: `NEW_KEY=$(openssl rand -hex 32)`
   - Backup completo do banco antes
   - Modo de manutenção ativado (rejeitar writes temporariamente)

2. **Re-encriptação in-place** via script SQL:
   ```sql
   UPDATE patients
     SET document = pgp_sym_encrypt(pgp_sym_decrypt(document, :old_key), :new_key)
     WHERE document IS NOT NULL;

   UPDATE clinical_notes
     SET content = pgp_sym_encrypt(pgp_sym_decrypt(content, :old_key), :new_key)
     WHERE content IS NOT NULL;
   ```

3. **Swap atômico da env var**:
   - Update `.env` no VPS
   - Reinicia a API
   - Valida: `curl GET /doctor/patients/:id/document` retorna valor correto

4. **Validação**:
   - Sample de registros: decrypt funciona
   - Nenhum ciphertext antigo com a chave velha persiste

5. **Fallback**:
   - Se algo falhar no meio, manter a chave velha E a nova simultaneamente via variável `LEGACY_DOCUMENT_ENCRYPTION_KEY`
   - Service tenta decrypt com chave nova, fallback pra legacy se falhar
   - Remover legacy depois de validar 100% re-encriptado

## Custo estimado

- Documentar o processo: 2h
- Script de re-encriptação testado: 2-4h (com testes em dev)
- Implementação do fallback dual-key: 4-6h (pra cobrir rollback sem downtime)

## Riscos de NÃO fazer

**Alto se ocorrer suspeita de vazamento da chave**. Hoje não teríamos procedimento — tudo ficaria exposto até alguém improvisar.

**Baixo durante operação normal** — chave só vaza se VPS for comprometido, e nesse caso a rotação é só parte do plano de resposta a incidente.

## Alternativas consideradas

- **Re-encriptação preguiçosa** (encrypt novos registros com key nova, decrypt antigos com key velha, migrando gradualmente no acesso): mais suave mas mais complexo (duas chaves ativas por semanas/meses)
- **KMS (AWS/HashiCorp Vault)**: mata o problema de vez mas é mudança grande de infra, vale junto com seed 001
- **Zero rotação**: aceitar que a chave é "pra vida toda" do projeto. Rejeitado — viola princípio básico de higiene de secrets
