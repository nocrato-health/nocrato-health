# Módulo: consent/

## O que este módulo faz

Gestão de consentimento LGPD (Art. 7º) e política de privacidade. Registra consentimentos explícitos e implícitos dos pacientes, verifica existência de consentimento, e serve a página pública da política de privacidade.

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `consent.module.ts` | Módulo `@Global()` que provê ConsentService + PrivacyPolicyController |
| `consent.service.ts` | registerConsent, hasConsent, listConsents — append-only |
| `consent.service.spec.ts` | Testes unitários do ConsentService |
| `privacy-policy.controller.ts` | `GET /api/v1/politica-de-privacidade` — HTML estático |
| `dto/register-consent.dto.ts` | Zod schema para registro de consentimento |

## Regras de negócio

- **Append-only**: cada aceite gera um novo registro (nunca update)
- **Versionado**: `consent_version` permite reaceite quando a política mudar
- **Três pontos de coleta**: booking (checkbox), portal do paciente, agente WhatsApp (implícito)
- **Sem PII no registro**: apenas tenant_id, patient_id, ip_address, user_agent
- **Idempotente**: `hasConsent()` verifica antes de registrar (evita duplicatas)

## Tabelas envolvidas

- `patient_consents` — registros de consentimento (criada em migration 021)
- `patients.deletion_requested_at` — LGPD Art. 18, V (adicionada em migration 021)

## Pontos de integração

| Módulo | Integração |
|--------|------------|
| `booking/` | Registra consent `privacy_policy` source `booking` no bookAppointment |
| `agent/` | Registra consent `privacy_policy` source `whatsapp_agent` no processMessage |
| `patient/` | `requestDeletion()` no portal do paciente (delete-request endpoint) |

## O que NÃO pertence a este módulo

- Lógica de exclusão efetiva de dados (manual pelo doutor)
- Envio de emails de notificação (futuro EmailModule handler)
- Cron de retenção de event_log (item 15 LGPD — futuro)
