# Architecture Decision Records - Nocrato Health V2

## Overview

This document captures the key architectural decisions made during the V2 redesign of Nocrato Health. Each decision follows the ADR (Architecture Decision Record) format: context, decision, consequences.

These decisions emerged from the architectural review of V1, where domain modeling problems and over-engineering for a solo developer were identified as the primary issues.

---

## ADR-001: Separate Auth Domains for Agency Members and Doctors

**Status**: Accepted

**Context**: In V1, the authentication system conflated agency staff and doctors into a single auth domain. This made RBAC confusing and led to unclear permission boundaries. Agency members and doctors have fundamentally different access patterns, different onboarding flows, and different data they can access.

**Decision**: Agency members and doctors are stored in separate tables (`agency_members` and `doctors`) with separate login endpoints (`/api/v1/agency/auth/login` and `/api/v1/doctor/auth/login`). Each auth domain issues JWTs with different role claims.

**Consequences**:
- Clear separation of concerns: agency routes only accept agency tokens, doctor routes only accept doctor tokens.
- Two login pages in the frontend, each with its own flow (agency is simple email+password; doctor uses a two-step email-resolve-then-password flow).
- Password reset flows are duplicated but follow the same pattern, reducing code divergence.
- A user cannot be both an agency member and a doctor with the same JWT -- this is by design.

---

## ADR-002: RBAC via NestJS Guards and Decorators

**Status**: Accepted

**Context**: V1 implemented RBAC through custom Fastify middleware, which required manual wiring per route and was error-prone. The system needed role-based access (agency_admin, agency_member, doctor) enforced consistently.

**Decision**: Use NestJS built-in Guards with custom decorators. A `@Roles('doctor')` decorator sets metadata on the route, and the `RolesGuard` reads it to enforce access. Guards are composable: `@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)`.

**Consequences**:
- RBAC is declarative and visible in the controller code (one line per controller or per route).
- Adding a new role requires only updating the `@Roles` decorator -- no middleware changes.
- Guard ordering matters: JwtAuthGuard must run before RolesGuard, which must run before TenantGuard.
- Testing is simplified: guards can be mocked independently in unit tests.

---

## ADR-003: File Uploads Stored Locally (MVP), Migrate to S3/R2 Later

**Status**: Accepted

**Context**: The system needs to handle file uploads for documents (prescriptions, certificates, exams) and branding assets (doctor logo). Cloud storage (S3, Cloudflare R2) adds cost and configuration complexity.

**Decision**: For the MVP, files are stored on the local filesystem at `./uploads/{tenantId}/`. The `upload.service.ts` saves files to disk and returns a URL path. Nginx serves the uploads directory in production.

**Consequences**:
- Simple to implement and deploy (single server on Hetzner).
- Tenant isolation is enforced by directory structure (`./uploads/{tenantId}/`).
- Files are not replicated -- if the server disk fails, uploads are lost. Backups must be configured separately.
- Migration to S3/R2 post-MVP requires changing only the `upload.service.ts` implementation. The rest of the system references files by URL, so the switch is transparent.
- Not suitable for horizontal scaling (multiple servers would not share the filesystem).

---

## ADR-004: Timezone Stored Per Doctor

**Status**: Accepted

**Context**: Appointment scheduling requires timezone awareness. Doctors may operate in different timezones across Brazil (or internationally in the future). The system needs to calculate available slots and display times correctly.

**Decision**: A `timezone` field is added to the `doctors` table with a default of `'America/Sao_Paulo'`. All slot calculations in `booking.service.ts` use the doctor's timezone. The `appointment_duration` field (in minutes) is also stored per doctor.

```sql
ALTER TABLE doctors ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE doctors ADD COLUMN appointment_duration INTEGER NOT NULL DEFAULT 30;
```

**Consequences**:
- Each doctor can configure their timezone during onboarding (Step 2: Schedule).
- Slot calculation is always relative to the doctor's timezone, avoiding UTC conversion bugs on the frontend.
- The frontend displays times in the doctor's timezone for the doctor portal and in the patient's local time for the booking page.
- Adding support for multi-timezone practices later requires only adding timezone to the working_hours JSONB (per-day override).

---

## ADR-005: Agente WhatsApp como Modulo Interno NestJS (sem N8N)

**Status**: Accepted

**Context**: A opcao original era usar N8N como plataforma de orquestracao externa para o agente WhatsApp. Para um dev solo no MVP, isso significaria manter dois sistemas separados (NestJS + N8N), debugar dois ambientes distintos, e consumir recursos extras no servidor (Hetzner CX22 com 4 GB RAM).

**Decision**: O agente WhatsApp e implementado como um modulo NestJS (`agent/`) dentro do proprio backend. A Evolution API envia webhooks diretamente para `POST /api/v1/agent/webhook`. O modulo gerencia o estado de conversa no banco, chama o LLM (OpenAI SDK — modelo `gpt-4o-mini`, mais barato e rapido para chatbot de agendamento), e envia respostas de volta via Evolution API HTTP client.

```
Evolution API → webhook → agent.controller.ts → agent.service.ts → LLM + DB
                                                       ↓
                                          whatsapp.service.ts → Evolution API
```

**Consequences**:
- Um unico sistema para manter, debugar e fazer deploy.
- Toda a logica em TypeScript com type safety e testes unitarios.
- O estado de conversa fica no PostgreSQL (tabela `conversations`), sem dependencia de servico externo.
- Eventos internos via `EventEmitter2` (built-in no NestJS) substituem o polling de 30s do N8N.
- Sem o N8N, o servidor economiza ~500MB-1GB de RAM no Hetzner CX22.
- A unica dependencia externa de infra para o agente e a Evolution API (ja necessaria de qualquer forma).

---

## ADR-006: Stateless Refresh Tokens (JWT, 7-Day Expiration)

**Status**: Accepted

**Context**: The system uses JWT access tokens (short-lived) and needs a refresh mechanism for seamless user sessions. Options considered: (a) store refresh tokens in a database table (allows revocation), (b) use stateless JWT refresh tokens (simpler).

**Decision**: Refresh tokens are stateless JWTs with 7-day expiration. They are not stored in the database. The `POST /api/v1/{agency|doctor}/auth/refresh` endpoint validates the refresh token and issues a new access + refresh token pair.

**Consequences**:
- No database table for tokens -- simpler schema and no cleanup jobs.
- Cannot revoke individual refresh tokens (e.g., "log out all devices"). This is acceptable for the MVP.
- If a refresh token is stolen, it remains valid for up to 7 days. Mitigation: access tokens have short expiration (15-30 minutes), limiting the window for stolen access tokens.
- Post-MVP, a token blacklist (Redis or database) can be added if session revocation becomes a requirement.

---

## ADR-007: Event Log como Audit Trail + EventEmitter2 para Comunicacao Interna

**Status**: Accepted

**Context**: Com o agente rodando internamente no NestJS, o mecanismo de polling de 30s via N8N para o `event_log` nao e mais necessario. Porem, o `event_log` ainda tem valor como audit trail imutavel de todas as acoes do sistema.

**Decision**: O `event_log` continua existindo como registro append-only de auditoria (quem fez o que e quando). Para comunicacao interna entre modulos (ex: appointment completado → agente envia WhatsApp), usa-se o `EventEmitter2` do NestJS, que e sincrono e nao requer polling.

```typescript
// appointment.service.ts
this.eventEmitter.emit('appointment.completed', { patientId, tenantId, code });

// agent.service.ts
@OnEvent('appointment.completed')
async handleAppointmentCompleted(payload) {
  await this.whatsappService.sendPortalCode(payload);
}
```

**Consequences**:
- Latencia zero entre evento e reacao (sincrono, sem polling de 30s).
- `event_log` permanece como audit trail imutavel para debugging e historico.
- Sem overhead de cursor management, timestamp storage, ou retry logic.
- O `event-log.interceptor.ts` continua auto-logando eventos em mutations para fins de auditoria.
- O event log cresce indefinidamente; politica de retencao necessaria pos-MVP.

---

## ADR-008: Booking Security (Temporary Tokens + Rate Limiting)

**Status**: Accepted

**Context**: The public booking page (`/book/:slug`) allows anyone with the link to schedule an appointment. Without protection, this is vulnerable to abuse: spam bookings, slot exhaustion, and scraping of doctor availability.

**Decision**: A multi-layered security approach:

1. **Temporary tokens**: O agente interno gera um booking token via `agent.service.ts` → `bookingService.generateToken()`. O token e armazenado em `booking_tokens` com expiracao de 24h e flag de uso unico. O paciente recebe o token embutido na URL do WhatsApp.
2. **Token validation**: Every booking endpoint (`/validate`, `/slots`, `/book`) requires a valid, non-expired, non-used token.
3. **Rate limiting**: `@nestjs/throttler` limits to 5 requests/hour per IP on booking endpoints.
4. **Phone-based limits**: Maximum 2 active (scheduled/waiting) appointments per phone number per doctor.

```sql
CREATE TABLE booking_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token       VARCHAR(64)  NOT NULL,
    phone       VARCHAR(20),
    expires_at  TIMESTAMPTZ  NOT NULL,
    used        BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT booking_tokens_token_unique UNIQUE (token)
);
CREATE INDEX idx_booking_tokens_token ON booking_tokens (token) WHERE used = false;
```

**Consequences**:
- Booking links only work when generated pelo agente interno durante uma conversa. Random URL guessing is ineffective due to the 64-character token.
- Each conversation gets one token, which can only be used once. If the patient wants to rebook, the agent generates a new token.
- Rate limiting prevents brute-force token guessing and slot scraping.
- Phone-based limits prevent a single patient from hoarding all available slots.
- The partial index (`WHERE used = false`) ensures fast lookups for active tokens without scanning used ones.

---

## ADR-009: Password Reset via Invite Table Reuse

**Status**: Accepted

**Context**: The system needs a "forgot my password" flow for both agency members and doctors. A dedicated password reset table could be created, but the existing `invites` table already has the required structure: token, expiration, accepted status.

**Decision**: Reuse the `invites` table with a new `type='password_reset'`. The flow is:
1. `POST /api/v1/{doctor|agency}/auth/forgot-password { email }` creates an invite with `type='password_reset'`, a random token, and 1-hour expiration.
2. Resend sends an email with the reset link.
3. `POST /api/v1/{doctor|agency}/auth/reset-password { token, newPassword }` validates the token, updates the password hash, and marks the invite as accepted.

**Consequences**:
- No new table required -- leverages existing invite infrastructure.
- The 1-hour expiration (vs 7 days for regular invites) is enforced at the service level.
- Token validation and email sending logic is shared with the invite flow, reducing duplication.
- The `invites` table serves multiple purposes (member invite, doctor invite, password reset), which could complicate queries. Mitigation: the `type` field clearly disambiguates.

---

## ADR-010: Appointment Conflict Detection with SELECT FOR UPDATE

**Status**: Accepted

**Context**: When a doctor creates an appointment manually or a patient books through the public page, the system must prevent double-booking the same time slot. In a concurrent environment, two requests could read the same "available" slot and both create appointments.

**Decision**: Use `SELECT ... FOR UPDATE` on the appointment row when creating a new appointment. The transaction locks the relevant time range, preventing concurrent inserts for the same slot.

**Consequences**:
- Race conditions are prevented at the database level (PostgreSQL row-level locking).
- The lock is held only for the duration of the transaction, minimizing contention.
- If two requests compete for the same slot, one succeeds and the other receives a 409 Conflict.
- This approach is simpler than application-level locking (Redis, semaphores) and more reliable.
- Works correctly with the booking service slot calculation: slots are generated from working_hours minus existing appointments, and the lock ensures consistency.

---

## ADR-011: Doctor Creates Appointments Manually

**Status**: Accepted

**Context**: Not all appointments come through the WhatsApp agent or the public booking page. Doctors may need to create appointments manually for walk-in patients, phone bookings, or transfers from other systems.

**Decision**: Doctors can create appointments via `POST /api/v1/doctor/appointments` with `created_by='doctor'` (vs `'agent'` for bookings created pelo agente interno). The same conflict detection and slot validation apply.

**Consequences**:
- The `created_by` field (`'doctor'` or `'agent'`) tracks the origin of each appointment for analytics and event log purposes.
- Manual appointments go through the same validation pipeline (conflict check, duration validation, working hours check).
- The frontend provides a dialog for creating appointments with a patient selector and date/time picker.

---

## ADR-012: Agency Access to Doctor Portal Deferred to Post-MVP

**Status**: Accepted (deferred)

**Context**: Agency admins may need to view or manage a doctor's portal directly (e.g., for support purposes). In V2 MVP, the agency portal shows a read-only view of doctor profiles.

**Decision**: For the MVP, agency admins can only view doctor profiles in read-only mode (name, email, slug, CRM, specialty, status) from the agency portal at `/agency/doctors/:doctorId`. Full "login as doctor" or "shadow access" functionality is deferred to V2+.

**Consequences**:
- Simpler auth model for MVP -- no cross-domain token generation or impersonation logic.
- Agency admins cannot debug doctor-side issues directly. They must ask the doctor or check logs.
- Post-MVP, a "view as doctor" feature can be implemented with a special agency-issued token that grants read-only access to a specific tenant.

---

## ADR-013: Doctor Deactivation Only Blocks New Bookings

**Status**: Accepted

**Context**: When an agency admin deactivates a doctor, existing appointments need to be handled. Options: (a) cancel all existing appointments, (b) keep existing appointments but block new ones.

**Decision**: Deactivating a doctor (`status='inactive'`) only blocks new appointment bookings. Existing scheduled, waiting, and in-progress appointments continue their normal lifecycle.

**Consequences**:
- Patients with existing appointments are not disrupted.
- The booking service checks `doctor.status` before allowing new bookings and returns an "unavailable" response if inactive.
- The doctor can still log in and manage their existing appointments until they are all completed/cancelled.
- Reactivation (`status='active'`) immediately re-enables new bookings.

---

## ADR-014: EventEmitter2 para Comunicacao Reativa entre Modulos

**Status**: Accepted

**Context**: Com o agente rodando internamente, a comunicacao entre modulos (appointment → agent, patient → agent) precisa ser desacoplada mas sem a latencia de polling. O NestJS fornece o `@nestjs/event-emitter` (baseado no `EventEmitter2`) como solucao nativa.

**Decision**: Eventos internos sao emitidos via `EventEmitter2` em vez de serem escritos no `event_log` para posterior polling. O agente subscreve os eventos relevantes com `@OnEvent()` e age imediatamente.

```typescript
// Emissao (appointment.service.ts)
this.eventEmitter.emit('patient.portal_activated', {
  phone: patient.phone,
  code: patient.portal_access_code,
  tenantId,
});

// Subscricao (agent.service.ts)
@OnEvent('patient.portal_activated')
async onPortalActivated(payload: PortalActivatedEvent) {
  await this.whatsappService.send(payload.phone,
    `Seu portal foi ativado! Codigo: ${payload.code}`
  );
}
```

**Consequences**:
- Latencia zero (sincrono no mesmo processo).
- Sem cursor management, sem estado externo, sem retry logic de polling.
- Se o processo cair durante o handler, o evento nao sera re-processado. Mitigation: para acoes criticas, escrever no `event_log` antes de emitir (o audit trail garante rastreabilidade).
- Escala bem para MVP com um unico servidor; para multi-instancia futura, migrar para Redis Pub/Sub ou BullMQ.

---

## ADR-015: Patient Portal Without JWT (Access Code Authentication)

**Status**: Accepted

**Context**: Patients need a simple way to view their medical information. Requiring account creation (email + password) adds friction for a population that primarily interacts via WhatsApp.

**Decision**: The patient portal uses a unique access code (e.g., `ABC-1234-XYZ`) instead of JWT authentication. The code is generated after the patient's first completed appointment and delivered via WhatsApp pelo agente interno (via `EventEmitter2`). The portal is stateless -- each request with a valid code returns the patient's data.

**Consequences**:
- Zero friction for patients: no account creation, no password, no email verification.
- The access code is tied to the patient record (`patients.portal_access_code`). Anyone with the code can view the data.
- The portal is read-only: patients can view personal data, appointment history, and download documents, but cannot modify anything.
- Security relies on the secrecy of the code. If shared, anyone can view the patient's data. Mitigation: codes are long enough to prevent guessing, and the portal only displays non-sensitive summary information.
- Post-MVP, OTP verification via WhatsApp can be added for additional security.

---

## Decision Summary

| # | Decision | Key Trade-off |
|---|----------|---------------|
| 001 | Separate auth domains (agency vs doctor) | Duplication of auth flows vs clear separation |
| 002 | RBAC via NestJS Guards + decorators | Framework coupling vs developer productivity |
| 003 | Local file uploads (MVP) | No replication vs simplicity |
| 004 | Timezone per doctor | Per-doctor config vs global default |
| 005 | Agente interno NestJS (sem N8N) | Mais codigo inicial vs zero dependencia externa, debug simples |
| 006 | Stateless refresh tokens | Cannot revoke sessions vs no database overhead |
| 007 | Event log (audit) + EventEmitter2 (internal) | Complexidade dividida vs latencia zero + audit trail |
| 008 | Booking security (tokens + rate limit) | Multi-layer complexity vs abuse prevention |
| 009 | Password reset via invite table | Table overloading vs no new schema |
| 010 | SELECT FOR UPDATE for conflicts | Lock contention vs correctness |
| 011 | Manual appointment creation | Two creation paths vs doctor flexibility |
| 012 | Agency portal access deferred | Limited admin tools vs MVP simplicity |
| 013 | Deactivation keeps existing appointments | Potential stale appointments vs patient continuity |
| 014 | EventEmitter2 para comunicacao interna | Sem re-processamento em crash vs latencia zero + desacoplamento |
| 015 | Patient portal without JWT | Code-based security vs zero friction |
