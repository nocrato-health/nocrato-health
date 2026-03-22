---
tags: [database]
type: database
---

# Nocrato Health V2 - Entity Relationship Documentation

## Entity Relationship Diagram

```
agency_members (standalone - Nocrato internal staff)
    |
    |-- invites (invited_by -> agency_members.id)
    |       |-- type: 'agency_member' (self-referencing flow)
    |       |-- type: 'doctor' (leads to tenant + doctor creation)
    |
tenants (doctor portal container - isolation boundary)
    |
    |-- doctors (1:1 with tenant)
    |-- agent_settings (1:1 with tenant)
    |-- booking_tokens (many per tenant - temporary, 24h expiry)
    |-- conversations (many per tenant - WhatsApp agent chat state, one per patient phone)
    |-- patients (many per tenant)
    |       |-- appointments (many per patient, scoped to tenant)
    |       |       |-- clinical_notes (many per appointment, scoped to tenant + patient)
    |       |       |-- documents (optionally linked to appointment)
    |       |-- documents (many per patient, scoped to tenant)
    |-- event_log (append-only audit trail per tenant)
```

### Detailed FK Diagram

```
+------------------+       +------------------+
|  agency_members  |<------| invites          |
|  (Nocrato staff) | 1   N | (invite tokens)  |
+------------------+       +--------+---------+
                                    |
                           invite_id (optional)
                                    |
                           +--------v---------+
                           | tenants          |
                           | (doctor portals) |
                           +--------+---------+
                                    |
              +----------+----------+----------+-----------+
              |          |          |          |           |
              v 1:1      v 1:1      v 1:N      v 1:N       v 1:N
        +---------+ +----------+ +--------+ +----------+ +----------+
        | doctors | | agent_   | |patients| | booking_ | | event_   |
        |         | | settings | |        | | tokens   | | log      |
        +---------+ +----------+ +---+----+ +----------+ +----------+
                                     |
                            +--------+--------+
                            |                 |
                            v 1:N             v 1:N
                     +-----------+      +-----------+
                     |appointments|     | documents |
                     +-----+-----+      +-----------+
                           |                 ^
                  +--------+--------+        |
                  |                 |        |
                  v 1:N             +--------+
           +-----------+       (optional FK)
           |clinical_  |
           |notes      |
           +-----------+

   Note: appointments has a self-referencing FK
         (rescheduled_to_id -> appointments.id)
```

---

## Table Descriptions

### 1. agency_members
Nocrato internal staff accounts. Completely separate authentication domain from doctors. Roles are `agency_admin` or `agency_member`. Status lifecycle: `pending` (invited) -> `active` -> `inactive`.

### 2. invites
Polymorphic invite table serving both agency member and doctor onboarding flows. Contains a cryptographically random token embedded in email links. Supports types: `agency_member`, `doctor`. Status lifecycle: `pending` -> `accepted` | `expired`.

### 3. tenants
The core isolation boundary. Each tenant represents one doctor's portal, identified by a URL-friendly slug (e.g., `dr-silva`). Contains portal branding configuration (color, logo). Every tenant-scoped table references `tenant_id`.

### 4. doctors
Professional profile and authentication credentials for the doctor behind a tenant. Stores CRM registration (split into number + state), working hours as JSONB, timezone, and default appointment duration. 1:1 with tenant in MVP.

### 5. agent_settings
WhatsApp AI agent configuration for a tenant. Stores the welcome message, personality instructions, FAQ content, scheduling rules as natural language text, and the `booking_mode` column (`'link' | 'chat' | 'both'`) that controls how the agent offers appointment scheduling. O agente interno le essas configuracoes no inicio de cada conversa para personalizar as respostas. 1:1 with tenant.

### 6. patients
Patient records created primarily by the WhatsApp agent. Identified by phone number within a tenant. After their first completed appointment, patients receive a globally unique portal access code for read-only portal access.

### 7. appointments
Core scheduling entity with a multi-step status lifecycle: `scheduled` -> `waiting` -> `in_progress` -> `completed`. Also supports `cancelled`, `rescheduled`, and `no_show` terminal states. Links to the patient who booked and optionally chains to a rescheduled replacement via self-referencing FK.

### 8. clinical_notes
Doctor-authored clinical notes tied to a specific appointment. Shared with the WhatsApp agent for post-appointment follow-up context. Contains sensitive medical data -- encryption at rest should be configured at the database/storage level.

### 9. documents
Files uploaded by the doctor for a patient (prescriptions, certificates, exams). Stored in object storage with URL references. Optionally linked to a specific appointment. Viewable by patients in their read-only portal.

### 10. event_log
Append-only, immutable audit trail of significant actions within a tenant. Usado para debugging e historico de auditoria. O agente interno usa `EventEmitter2` para reagir a eventos em tempo real -- o `event_log` serve como registro permanente. Uses polymorphic `actor_type` + `actor_id` instead of explicit FKs.

### 11. booking_tokens
Temporary tokens (24h expiry) for securing the public booking page. Generated pelo agente interno (`bookingService.generateToken()`) quando envia um link de agendamento ao paciente via WhatsApp. Single-use: once a patient books an appointment, the token is marked as `used`.

### 12. conversations
WhatsApp conversation state per patient phone number, scoped to tenant. Stores up to the last 20 messages as JSONB for LLM context window. Used exclusively by the `agent/` module (`conversation.service.ts`). Identified by the composite unique key `(tenant_id, phone)` — the phone number is the session identifier (no JWT required).

---

## Relationships

### One-to-One (1:1)

| Parent | Child | FK Column | Constraint | Notes |
|--------|-------|-----------|------------|-------|
| tenants | doctors | `doctors.tenant_id` | `doctors_tenant_unique` UNIQUE | One doctor per tenant in MVP. Drop constraint for V2 multi-practitioner clinics. |
| tenants | agent_settings | `agent_settings.tenant_id` | `agent_settings_tenant_unique` UNIQUE | One agent configuration per portal. |
| invites | tenants | `tenants.invite_id` | None (nullable FK) | Tracks which invite created the tenant. Nullable for manual creation. |

### One-to-Many (1:N)

| Parent | Child | FK Column | ON DELETE | Notes |
|--------|-------|-----------|-----------|-------|
| agency_members | invites | `invites.invited_by` | NO ACTION | Every invite is created by an agency member. |
| tenants | patients | `patients.tenant_id` | CASCADE | Many patients per doctor portal. |
| tenants | appointments | `appointments.tenant_id` | CASCADE | Denormalized tenant FK for query performance. |
| tenants | clinical_notes | `clinical_notes.tenant_id` | CASCADE | Denormalized tenant FK for query performance. |
| tenants | documents | `documents.tenant_id` | CASCADE | Denormalized tenant FK for query performance. |
| tenants | event_log | `event_log.tenant_id` | CASCADE | Many audit events per tenant. |
| tenants | booking_tokens | `booking_tokens.tenant_id` | CASCADE | Many booking tokens per tenant. |
| tenants | conversations | `conversations.tenant_id` | CASCADE | Many conversation threads per tenant (one per patient phone). |
| patients | appointments | `appointments.patient_id` | CASCADE | Many appointments per patient. |
| patients | documents | `documents.patient_id` | CASCADE | Many documents per patient. |
| patients | clinical_notes | `clinical_notes.patient_id` | CASCADE | Many notes per patient (across appointments). |
| appointments | clinical_notes | `clinical_notes.appointment_id` | CASCADE | Many notes per appointment. |
| appointments | documents | `documents.appointment_id` | SET NULL | Optional link. SET NULL preserves the document if the appointment is deleted. |

### Self-Referencing

| Table | FK Column | Notes |
|-------|-----------|-------|
| appointments | `rescheduled_to_id` -> `appointments.id` | When an appointment is rescheduled, this points to the replacement appointment, creating a chain. |

### Polymorphic References (No FK)

| Table | Columns | Notes |
|-------|---------|-------|
| event_log | `actor_type` + `actor_id` | `actor_type` is `doctor`, `agent`, `system`, or `agency_member`. `actor_id` references the corresponding table's `id` column. No FK constraint because it spans multiple tables. |

---

## Tenant Isolation Model

### Principle

Every table below `tenants` in the hierarchy carries a `tenant_id` foreign key column. **All queries for doctor-facing features MUST filter by `tenant_id`** to enforce data isolation between doctor portals.

### Which Tables Have tenant_id

| Table | Has tenant_id | Reason |
|-------|:---:|--------|
| agency_members | No | Nocrato-internal, not tenant-scoped. |
| invites | No | Cross-tenant (agency creates invites for new tenants). |
| tenants | N/A | The tenant itself -- `id` is the boundary. |
| doctors | Yes | Scoped to one tenant (1:1 in MVP). |
| agent_settings | Yes | Configuration for one tenant's agent (1:1). |
| patients | Yes | Patients belong to exactly one doctor portal. |
| appointments | Yes | Denormalized for direct tenant filtering without JOINs. |
| clinical_notes | Yes | Denormalized for direct tenant filtering without JOINs. |
| documents | Yes | Denormalized for direct tenant filtering without JOINs. |
| event_log | Yes | Audit events scoped to a tenant. |
| booking_tokens | Yes | Tokens scoped to a tenant's booking page. |
| conversations | Yes | WhatsApp agent chat state scoped to one tenant. |

### Why Denormalize tenant_id

Tables like `appointments`, `clinical_notes`, and `documents` could derive their tenant from parent tables (e.g., `appointments.patient_id` -> `patients.tenant_id`). The `tenant_id` is denormalized directly onto these tables for two reasons:

1. **Query performance**: The most common access pattern is "list X for this tenant". A direct `WHERE tenant_id = ?` avoids JOINs on every query.
2. **Security enforcement**: Application-level middleware can inject `tenant_id` into every query unconditionally, without needing to understand the table hierarchy.

### Future: Row-Level Security (V2)

In V2, PostgreSQL Row-Level Security (RLS) policies may be added for defense-in-depth. This would enforce tenant isolation at the database engine level, preventing data leaks even if application code has bugs:

```sql
-- Example (not in MVP):
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patients
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Cascade Delete Behavior

All tenant-scoped tables use `ON DELETE CASCADE` from `tenants`. If a tenant record is deleted, all associated data (doctor profile, patients, appointments, notes, documents, events, tokens) is automatically cleaned up. In practice, tenants should be set to `status = 'inactive'` rather than deleted -- deletion is reserved for exceptional circumstances.