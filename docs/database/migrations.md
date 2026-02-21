# Nocrato Health V2 - Database Migrations

## Migration Order

The schema is split into 14 sequential migration files. The ordering strictly respects foreign key dependencies: each migration only references tables created in earlier migrations.

| # | Migration File | Table/Object Created | FK Dependencies |
|---|---------------|---------------------|-----------------|
| 001 | `001_create_agency_members.sql` | `agency_members` | None (standalone) |
| 002 | `002_create_invites.sql` | `invites` | `agency_members` (invited_by) |
| 003 | `003_create_tenants.sql` | `tenants` | `invites` (invite_id, nullable) |
| 004 | `004_create_doctors.sql` | `doctors` | `tenants` (tenant_id) |
| 005 | `005_create_agent_settings.sql` | `agent_settings` | `tenants` (tenant_id) |
| 006 | `006_create_patients.sql` | `patients` | `tenants` (tenant_id) |
| 007 | `007_create_appointments.sql` | `appointments` | `tenants` (tenant_id), `patients` (patient_id), self-ref (rescheduled_to_id) |
| 008 | `008_create_clinical_notes.sql` | `clinical_notes` | `tenants` (tenant_id), `patients` (patient_id), `appointments` (appointment_id) |
| 009 | `009_create_documents.sql` | `documents` | `tenants` (tenant_id), `patients` (patient_id), `appointments` (appointment_id, nullable) |
| 010 | `010_create_event_log.sql` | `event_log` | `tenants` (tenant_id) |
| 011 | `011_create_booking_tokens.sql` | `booking_tokens` | `tenants` (tenant_id) |
| 012 | `012_create_triggers.sql` | `update_updated_at_column()` function + triggers on all 9 mutable tables | All tables (applies triggers) |
| 013 | `013_create_conversations.sql` | `conversations` | `tenants` (tenant_id) |
| 014 | `014_add_booking_mode_to_agent_settings.sql` | `agent_settings.booking_mode` column | `agent_settings` |

---

## FK Dependency Graph

The dependency ordering can be visualized as a directed acyclic graph (DAG). An arrow `A -> B` means "B must be created before A":

```
001 agency_members          (no dependencies)
 |
 v
002 invites                 (depends on: agency_members)
 |
 v
003 tenants                 (depends on: invites)
 |
 +---> 004 doctors          (depends on: tenants)
 |
 +---> 005 agent_settings   (depends on: tenants)
 |
 +---> 006 patients         (depends on: tenants)
 |      |
 |      +---> 007 appointments  (depends on: tenants, patients, self)
 |             |
 |             +---> 008 clinical_notes  (depends on: tenants, patients, appointments)
 |             |
 |             +---> 009 documents       (depends on: tenants, patients, appointments)
 |
 +---> 010 event_log        (depends on: tenants)
 |
 +---> 011 booking_tokens   (depends on: tenants)

012 triggers                (depends on: all tables above)
 |
 +---> 013 conversations    (depends on: tenants)
 |
 +---> 014 alter agent_settings (add booking_mode column)
```

### Critical Ordering Constraints

1. **agency_members MUST come first** -- `invites.invited_by` references it.
2. **invites MUST precede tenants** -- `tenants.invite_id` references it (even though nullable).
3. **tenants MUST precede everything else** -- all tenant-scoped tables depend on it.
4. **patients MUST precede appointments** -- `appointments.patient_id` references it.
5. **appointments MUST precede clinical_notes and documents** -- both reference `appointments.id`.
6. **triggers MUST come last** -- they reference all the tables they attach to.

### Parallel-Safe Groups

If the migration tool supports parallel execution, these groups can run concurrently within each level:

- **Level 0**: `001_create_agency_members`
- **Level 1**: `002_create_invites`
- **Level 2**: `003_create_tenants`
- **Level 3**: `004`, `005`, `006`, `010`, `011` (all depend only on tenants)
- **Level 7**: `013` (conversations — depends on tenants), `014` (alter agent_settings — runs after triggers)
- **Level 4**: `007_create_appointments` (depends on tenants + patients)
- **Level 5**: `008`, `009` (both depend on tenants + patients + appointments)
- **Level 6**: `012_create_triggers`

---

## Naming Convention

### Migration Files

```
{NNN}_{action}_{table_name}.sql
```

| Component | Convention | Examples |
|-----------|-----------|----------|
| `NNN` | 3-digit zero-padded sequence number | `001`, `002`, ..., `012` |
| `action` | Verb describing the operation | `create`, `alter`, `add`, `drop`, `seed` |
| `table_name` | snake_case table or object name | `agency_members`, `triggers`, `booking_tokens` |

**Examples of future migrations:**
```
013_add_deleted_at_to_patients.sql
014_create_roles_table.sql
015_alter_agency_members_add_role_fk.sql
016_create_schedule_exceptions.sql
017_seed_initial_admin.sql
```

### Database Objects

| Object | Convention | Example |
|--------|-----------|---------|
| Tables | `snake_case`, plural | `agency_members`, `clinical_notes` |
| Columns | `snake_case` | `tenant_id`, `created_at`, `password_hash` |
| Primary keys | `id` (UUID) | `agency_members.id` |
| Foreign keys | `{referenced_table_singular}_id` | `tenant_id`, `patient_id`, `appointment_id` |
| Constraints (UNIQUE) | `{table}_{column}_unique` | `agency_members_email_unique` |
| Constraints (CHECK) | `{table}_{column}_check` | `doctors_status_check` |
| Indexes | `idx_{table}_{columns}` | `idx_appointments_tenant_datetime` |
| Triggers | `set_updated_at` (consistent name) | `set_updated_at` on each table |
| Functions | `snake_case` verb phrase | `update_updated_at_column()` |

### Column Conventions

| Convention | Applied To | Example |
|-----------|-----------|---------|
| `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Every table | Consistent PK generation |
| `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` | Every table | Creation timestamp |
| `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` | All mutable tables | Last modification (auto-updated by trigger) |
| `status VARCHAR(50) NOT NULL DEFAULT '...'` | Most tables | State machine column with CHECK constraint |
| `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` | All tenant-scoped tables | Isolation boundary |

---

## What Each Migration Contains

Each migration file should include the following sections in order:

1. **Header comment** -- table name, purpose, one-line description.
2. **CREATE TABLE** -- full table definition with all columns, defaults, and inline constraints.
3. **Indexes** -- all indexes for the table, each with a comment explaining the query pattern it supports.
4. **Comments** -- `COMMENT ON TABLE` and `COMMENT ON COLUMN` for important columns.

Migration 012 (triggers) additionally contains:
1. The `CREATE OR REPLACE FUNCTION update_updated_at_column()` trigger function.
2. One `CREATE TRIGGER set_updated_at` statement per mutable table (9 total, excluding `event_log` and `booking_tokens`).

---

## Index Strategy Summary

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| agency_members | `idx_agency_members_email` | B-tree | Auth login by email |
| agency_members | `idx_agency_members_status` | B-tree | Admin filtering by status |
| invites | `idx_invites_token` | B-tree | Invite acceptance flow (token lookup) |
| invites | `idx_invites_email_status` | Composite B-tree | Duplicate invite prevention |
| invites | `idx_invites_type_status` | Composite B-tree | Admin invite listing by type |
| tenants | `idx_tenants_slug` | Unique B-tree | URL resolution (most frequent tenant query) |
| tenants | `idx_tenants_status` | B-tree | Admin dashboard filtering |
| doctors | `idx_doctors_email` | B-tree | Auth login by email |
| doctors | `idx_doctors_tenant_id` | B-tree | JOIN resolution (1:1 but still useful) |
| agent_settings | `idx_agent_settings_tenant_id` | B-tree | Agent config lookup by tenant |
| patients | `idx_patients_tenant_phone` | Unique Composite | Agent patient resolution + phone dedup per tenant |
| patients | `idx_patients_portal_access_code` | Partial B-tree | Patient portal login (only rows with non-NULL code) |
| patients | `idx_patients_tenant_id` | B-tree | Doctor patient listing |
| patients | `idx_patients_tenant_cpf` | Partial Composite | CPF deduplication (only rows with non-NULL CPF) |
| appointments | `idx_appointments_tenant_datetime` | Composite B-tree | Schedule view -- THE most common query |
| appointments | `idx_appointments_patient_id` | B-tree | Patient appointment history |
| appointments | `idx_appointments_tenant_status` | Composite B-tree | Status filtering within tenant |
| appointments | `idx_appointments_status_datetime` | Partial Composite | Auto-waiting transition (only 'scheduled' rows) |
| appointments | `idx_appointments_tenant_patient_date` | Composite B-tree | Conflict detection when scheduling |
| clinical_notes | `idx_clinical_notes_appointment_id` | B-tree | Note loading per appointment |
| clinical_notes | `idx_clinical_notes_patient_id` | B-tree | Patient note history |
| clinical_notes | `idx_clinical_notes_tenant_id` | B-tree | Tenant-scoped queries |
| documents | `idx_documents_patient_id` | B-tree | Patient document listing |
| documents | `idx_documents_tenant_id` | B-tree | Tenant-scoped listing |
| documents | `idx_documents_appointment_id` | Partial B-tree | Appointment-linked docs (only non-NULL rows) |
| documents | `idx_documents_tenant_type` | Composite B-tree | Type filtering within tenant |
| event_log | `idx_event_log_tenant_created` | Composite B-tree | Audit trail chronological queries (debugging e historico) |
| event_log | `idx_event_log_tenant_event_type` | Composite B-tree | Event type filtering within tenant |
| event_log | `idx_event_log_event_type` | Composite B-tree | Global monitoring by agency |
| booking_tokens | `idx_booking_tokens_token` | Partial B-tree | Token validation (only unused tokens) |
| booking_tokens | `idx_booking_tokens_expires_at` | B-tree | Cleanup of expired tokens |
| conversations | `idx_conversations_tenant_phone` | Unique Composite | getOrCreate by tenant + phone |
| conversations | `idx_conversations_last_message_at` | B-tree | Cleanup of stale sessions |

### Index Design Principles

1. **Composite indexes lead with tenant_id** -- The most common filter is always `WHERE tenant_id = ?`. Placing `tenant_id` first in composite indexes allows PostgreSQL to use a single index scan for both tenant isolation and the secondary filter.

2. **Partial indexes reduce bloat** -- Three partial indexes are used where the indexed subset is significantly smaller than the full table:
   - `idx_patients_portal_access_code`: Most patients will not have a portal code initially.
   - `idx_appointments_status_datetime`: Only `scheduled` appointments need the auto-waiting check.
   - `idx_documents_appointment_id`: Some documents are general (not appointment-linked).
   - `idx_booking_tokens_token`: Only unused tokens need to be looked up.

3. **Unique indexes enforce business rules** -- `idx_patients_tenant_phone` and `idx_tenants_slug` are unique indexes that double as data integrity constraints, enforcing one patient per phone per tenant and globally unique tenant slugs.

4. **No over-indexing** -- Every index is justified by a documented query pattern. Indexes are not added speculatively. As query patterns evolve in V2, new indexes can be added via incremental migrations.

---

## Seed Data (Migration 017 or separate seed script)

The initial seed creates the first agency admin, bypassing the invite flow:

```sql
INSERT INTO agency_members (email, password_hash, name, role, status)
VALUES (
    'admin@nocrato.com',
    '$2b$10$...',  -- bcrypt hash of 'admin123'
    'Admin Nocrato',
    'agency_admin',
    'active'
);
```

This is typically run as a separate seed script (`pnpm --filter @nocrato/api seed`) rather than a numbered migration, to keep migrations idempotent and environment-agnostic.

---

## Rollback Strategy

Each migration should have a corresponding `down` function or rollback SQL. For the CREATE TABLE migrations, the rollback is simply:

```sql
-- Rollback order is the REVERSE of creation order
DROP TRIGGER IF EXISTS set_updated_at ON documents;
DROP TRIGGER IF EXISTS set_updated_at ON clinical_notes;
DROP TRIGGER IF EXISTS set_updated_at ON appointments;
DROP TRIGGER IF EXISTS set_updated_at ON patients;
DROP TRIGGER IF EXISTS set_updated_at ON agent_settings;
DROP TRIGGER IF EXISTS set_updated_at ON doctors;
DROP TRIGGER IF EXISTS set_updated_at ON tenants;
DROP TRIGGER IF EXISTS set_updated_at ON invites;
DROP TRIGGER IF EXISTS set_updated_at ON agency_members;
DROP FUNCTION IF EXISTS update_updated_at_column();

DROP TABLE IF EXISTS booking_tokens;
DROP TABLE IF EXISTS event_log;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS clinical_notes;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS agent_settings;
DROP TABLE IF EXISTS doctors;
DROP TABLE IF EXISTS tenants;
DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS agency_members;
```

Rollback order is the reverse of creation order to respect FK constraints. Tables that are referenced by others must be dropped last.
