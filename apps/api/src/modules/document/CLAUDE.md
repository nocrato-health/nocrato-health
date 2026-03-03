# Document Module

## Responsabilidade

Gestão de documentos clínicos (prescrições, atestados, exames, outros) vinculados a pacientes
no portal do doutor. Responsável pelo upload de arquivos para disco local e pelo registro de
documentos no banco de dados com audit trail.

## Endpoints expostos

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/v1/doctor/upload` | Upload de arquivo via multipart/form-data para disco local |
| POST | `/api/v1/doctor/documents` | Registra documento no banco após upload |

## Arquivos principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `document.module.ts` | Registra controller e service; exporta DocumentService para uso em outros módulos |
| `document.controller.ts` | Handlers HTTP POST upload e POST documents; FileInterceptor com diskStorage |
| `document.service.ts` | Queries Knex: validação de patient + insert em documents + event_log na transação |
| `dto/create-document.dto.ts` | Zod schema para body de criação (patientId, type, fileUrl, fileName, etc.) |
| `document.service.spec.ts` | Testes unitários do DocumentService — mock manual do Knex com transaction e builder |

## Tabelas envolvidas

- `documents` — scoped por `tenant_id`; insert principal
- `patients` — validação: deve existir e pertencer ao tenant (WHERE { id, tenant_id })
- `event_log` — escrita de `document.uploaded` dentro da mesma transação

## Campos retornados

`id`, `patient_id`, `appointment_id`, `type`, `file_url`, `file_name`, `description`, `created_at`

Constante `DOCUMENT_FIELDS` exportada de `document.service.ts` para reutilização em US-6.4
(listagem de documentos) e em `patient.service` (perfil do paciente).

## Regras de negócio

### Upload de arquivo (POST /upload)

- Recebe `multipart/form-data` com campo `file`
- Salva em `./uploads/{tenantId}/` (diretório criado via `mkdirSync` se não existir)
- Filename no disco = `file.originalname` (preservado para MVP)
- Retorna `{ fileUrl: "/uploads/{tenantId}/{filename}", fileName: "originalname" }`

### Registro de documento (POST /documents)

- Body JSON: `{ patientId, appointmentId?, type, fileUrl, fileName, description? }`
- `type` aceita apenas: `'prescription' | 'certificate' | 'exam' | 'other'`
- Patient deve existir no tenant: `WHERE { id: patientId, tenant_id }` → 404 `'Paciente não encontrado'`
- `appointmentId` é opcional — quando fornecido, NÃO é validado (MVP confia no caller)
- Atomicidade: validação + insert documents + event_log dentro de `knex.transaction()`
- Evento de audit trail: `event_type='document.uploaded'`, `actor_type='doctor'`, payload `{ documentId, patientId, type }`

## Guards obrigatórios

Todos os endpoints deste módulo requerem:

```typescript
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
```

Os guards são declarados na CLASS (não no método individual).

## Mensagens de exceção (português obrigatório)

- `'Paciente não encontrado'` — NotFoundException quando patient não existe no tenant

## O que NÃO pertence a este módulo

- Auth do doutor (login, refresh, invite) → `modules/auth/`
- Gestão de pacientes → `modules/patient/`
- Lifecycle de consultas → `modules/appointment/`
- Notas clínicas → `modules/clinical-note/`
- Booking público → `modules/booking/`
- Portal do paciente — documentos são expostos via `patient.service` (sem clinical_notes)

## Como rodar / testar isoladamente

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=document
```
