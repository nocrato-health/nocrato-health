-- =============================================================================
-- NOCRATO HEALTH V2 - PostgreSQL 16 Database Schema
-- =============================================================================
-- Version: 1.0.0 (MVP)
-- Convention: snake_case, UUIDs, created_at/updated_at on all tables
-- Tables: 12 (agency_members, invites, tenants, doctors, agent_settings,
--              patients, appointments, clinical_notes, documents, event_log,
--              booking_tokens, conversations)
-- =============================================================================

-- Enable UUID generation (built into PostgreSQL 14+, but explicit for clarity)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- 1. AGENCY MEMBERS
-- Nocrato internal staff. Completely separate auth domain from doctors.
-- =============================================================================
CREATE TABLE agency_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255),
    -- password_hash is NULL until the member accepts their invite and sets a password.
    -- Only the very first agency_admin is seeded with a password directly.
    name            VARCHAR(255) NOT NULL,
    role            VARCHAR(50)  NOT NULL DEFAULT 'agency_member',
    -- MVP roles: 'agency_admin' | 'agency_member'
    -- V2 will introduce granular RBAC; this column may become a FK to a roles table.
    status          VARCHAR(50)  NOT NULL DEFAULT 'pending',
    -- 'pending' (invited, not yet logged in) | 'active' | 'inactive'
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agency_members_email_unique UNIQUE (email),
    CONSTRAINT agency_members_role_check CHECK (role IN ('agency_admin', 'agency_member')),
    CONSTRAINT agency_members_status_check CHECK (status IN ('pending', 'active', 'inactive'))
);

-- Index: lookup by email for authentication
CREATE INDEX idx_agency_members_email ON agency_members (email);
-- Index: filter by status (e.g., list active members)
CREATE INDEX idx_agency_members_status ON agency_members (status);

COMMENT ON TABLE agency_members IS 'Nocrato internal staff. Separate auth domain from doctors.';
COMMENT ON COLUMN agency_members.password_hash IS 'NULL until member accepts invite and sets password. First admin is seeded directly.';
COMMENT ON COLUMN agency_members.role IS 'MVP: agency_admin | agency_member. V2 will introduce granular RBAC.';


-- =============================================================================
-- 2. INVITES
-- Polymorphic invite table for both agency members and doctors.
-- The invite flow:
--   1. Agency admin creates invite -> status='pending', token generated
--   2. Email sent with link containing token
--   3. Recipient clicks link -> validates token -> sets password
--   4. For doctors: also creates tenant + doctor record
--   5. status='accepted'
-- =============================================================================
CREATE TABLE invites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            VARCHAR(50)  NOT NULL,
    -- 'agency_member' | 'doctor'
    email           VARCHAR(255) NOT NULL,
    invited_by      UUID         NOT NULL REFERENCES agency_members(id),
    -- Always an agency member (admin or authorized member) who created the invite.
    token           VARCHAR(255) NOT NULL,
    -- Unique token embedded in the invite email link. Should be cryptographically random.
    status          VARCHAR(50)  NOT NULL DEFAULT 'pending',
    -- 'pending' | 'accepted' | 'expired'
    expires_at      TIMESTAMPTZ  NOT NULL,
    -- Invites should expire (e.g., 7 days). Cron or app logic marks them expired.
    accepted_at     TIMESTAMPTZ,
    metadata        JSONB        DEFAULT '{}',
    -- Optional: store extra context like intended role for agency_member invites,
    -- or suggested specialty for doctor invites. Keeps the table flexible.
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT invites_type_check CHECK (type IN ('agency_member', 'doctor')),
    CONSTRAINT invites_status_check CHECK (status IN ('pending', 'accepted', 'expired')),
    CONSTRAINT invites_token_unique UNIQUE (token)
);

-- Index: token lookup for invite acceptance flow (most critical query)
CREATE INDEX idx_invites_token ON invites (token);
-- Index: find pending invites by email (prevent duplicate invites)
CREATE INDEX idx_invites_email_status ON invites (email, status);
-- Index: list invites by type (admin view)
CREATE INDEX idx_invites_type_status ON invites (type, status);

COMMENT ON TABLE invites IS 'Polymorphic invite table for agency members and doctors. Token-based email flow.';
COMMENT ON COLUMN invites.metadata IS 'Flexible JSONB for invite context (e.g., intended role, suggested specialty).';
COMMENT ON COLUMN invites.expires_at IS 'Invites expire after a configurable period (default: 7 days).';


-- =============================================================================
-- 3. TENANTS
-- Each tenant = one doctor portal. The tenant is the isolation boundary for
-- all doctor-related data. Created when a doctor accepts their invite.
-- =============================================================================
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(100) NOT NULL,
    -- URL-friendly identifier. e.g., "dr-silva" -> app.nocrato.com/dr-silva
    -- Set by the doctor during onboarding (invite acceptance).
    name            VARCHAR(255) NOT NULL,
    -- Display name for the portal (e.g., "Dr. Maria Silva - Cardiologia")
    status          VARCHAR(50)  NOT NULL DEFAULT 'active',
    -- 'active' | 'inactive'
    -- Inactive tenants: portal is inaccessible, agent is disabled.
    primary_color   VARCHAR(7)   DEFAULT '#0066CC',
    -- Hex color code for portal branding. Default is Nocrato blue.
    logo_url        TEXT,
    -- URL to the uploaded logo (stored in object storage like S3).
    invite_id       UUID         REFERENCES invites(id),
    -- Reference to the invite that created this tenant. Nullable for edge cases
    -- (e.g., manual creation by superadmin). Useful for audit trail.
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT tenants_slug_unique UNIQUE (slug),
    CONSTRAINT tenants_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT tenants_primary_color_check CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$')
);

-- Index: slug lookup is the most frequent tenant resolution query
CREATE UNIQUE INDEX idx_tenants_slug ON tenants (slug);
-- Index: filter by status (admin dashboard)
CREATE INDEX idx_tenants_status ON tenants (status);

COMMENT ON TABLE tenants IS 'Doctor portal container. All doctor-scoped data references tenant_id. 1:1 with doctors.';
COMMENT ON COLUMN tenants.slug IS 'URL-friendly identifier set during onboarding. e.g., "dr-silva" -> /dr-silva';
COMMENT ON COLUMN tenants.primary_color IS 'Hex color for portal branding. Must match #RRGGBB format.';


-- =============================================================================
-- 4. DOCTORS
-- One doctor per tenant. The doctor is the human behind the tenant.
-- Separate table from tenants because:
--   a) Clean separation of portal config vs. professional profile
--   b) V2 may support multiple practitioners per tenant (clinics)
--   c) Auth credentials belong on the person, not the portal
-- =============================================================================
CREATE TABLE doctors (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email                   VARCHAR(255) NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,
    name                    VARCHAR(255) NOT NULL,
    crm                     VARCHAR(15)  NOT NULL,
    -- Brazilian medical registration: 4-10 digits + 2-letter state code.
    -- Example: "123456SP", "1234567890RJ"
    -- Format validation should happen at app level for flexibility.
    crm_state               CHAR(2)      NOT NULL,
    -- Brazilian state abbreviation (UF). Separated from CRM number for
    -- easier querying and validation. e.g., 'SP', 'RJ', 'MG'
    specialty               VARCHAR(255),
    -- Medical specialty. Free text for MVP; V2 may normalize to a lookup table.
    phone                   VARCHAR(20),
    -- Doctor's contact phone. Optional.
    working_hours           JSONB        DEFAULT '{}',
    -- Flexible schedule definition. Example structure:
    -- {
    --   "monday":    [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}],
    --   "tuesday":   [{"start": "08:00", "end": "12:00"}],
    --   "wednesday": [],  // day off
    --   ...
    -- }
    -- JSONB allows the agent to read schedule without joins.
    timezone                VARCHAR(50)  NOT NULL DEFAULT 'America/Sao_Paulo',
    -- IANA timezone identifier for the doctor's location.
    -- Used for converting UTC appointment times to local display.
    appointment_duration    INTEGER      NOT NULL DEFAULT 30,
    -- Default appointment duration in minutes for slot calculation.
    onboarding_completed    BOOLEAN      NOT NULL DEFAULT false,
    -- Becomes true after the doctor completes all onboarding steps
    -- (slug selection, profile, working hours, agent config).
    status                  VARCHAR(50)  NOT NULL DEFAULT 'active',
    -- 'active' | 'inactive'
    last_login_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT doctors_email_unique UNIQUE (email),
    CONSTRAINT doctors_tenant_unique UNIQUE (tenant_id),
    -- 1:1 with tenant. In V2 (multi-practitioner clinics), this constraint
    -- would be dropped and replaced with a role-based mapping table.
    CONSTRAINT doctors_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT doctors_crm_state_check CHECK (crm_state ~ '^[A-Z]{2}$'),
    CONSTRAINT doctors_appointment_duration_check CHECK (appointment_duration > 0 AND appointment_duration <= 480)
);

-- Index: email lookup for authentication
CREATE INDEX idx_doctors_email ON doctors (email);
-- Index: tenant lookup (1:1 but still useful for JOINs)
CREATE INDEX idx_doctors_tenant_id ON doctors (tenant_id);

COMMENT ON TABLE doctors IS 'Doctor profile and credentials. 1:1 with tenants in MVP. V2 may support multi-practitioner clinics.';
COMMENT ON COLUMN doctors.crm IS 'Brazilian medical registration number (4-10 digits). State stored separately in crm_state.';
COMMENT ON COLUMN doctors.crm_state IS 'Brazilian state abbreviation (UF) for CRM. e.g., SP, RJ, MG.';
COMMENT ON COLUMN doctors.working_hours IS 'JSONB schedule: {"monday": [{"start":"08:00","end":"12:00"}], ...}';
COMMENT ON COLUMN doctors.onboarding_completed IS 'True after doctor finishes all onboarding steps (profile, hours, agent config).';
COMMENT ON COLUMN doctors.timezone IS 'IANA timezone identifier. Default: America/Sao_Paulo. Used for UTC -> local conversion.';
COMMENT ON COLUMN doctors.appointment_duration IS 'Default appointment slot duration in minutes. Used for slot calculation in booking.';


-- =============================================================================
-- 5. AGENT SETTINGS
-- WhatsApp AI agent configuration. 1:1 with tenant.
-- Lido pelo agente interno (agent.service.ts) no inicio de cada conversa para personalizar respostas.
-- =============================================================================
CREATE TABLE agent_settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    welcome_message     TEXT         DEFAULT '',
    -- Message the agent sends when a new patient initiates contact.
    -- Example: "Ola! Sou a assistente virtual do Dr. Silva. Como posso ajudar?"
    personality         TEXT         DEFAULT '',
    -- Instructions for the agent's tone and behavior.
    -- Example: "Seja formal mas acolhedor. Use linguagem simples."
    faq                 TEXT         DEFAULT '',
    -- Frequently asked questions and their answers that the agent can reference.
    -- Free-form text for MVP. V2 may structure this as JSONB array.
    appointment_rules   TEXT         DEFAULT '',
    -- Rules for scheduling: minimum notice, max per day, break between appointments, etc.
    -- Free text for MVP. Agent interprets these as natural language instructions.
    extra_config        JSONB        DEFAULT '{}',
    -- Catch-all for any additional agent configuration that doesn't warrant
    -- its own column yet. Keeps the schema flexible without migrations.
    enabled             BOOLEAN      NOT NULL DEFAULT true,
    -- Master switch to enable/disable the agent for this tenant.
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    booking_mode        VARCHAR(10)  NOT NULL DEFAULT 'both'
                        CONSTRAINT agent_settings_booking_mode_check CHECK (booking_mode IN ('link', 'chat', 'both')),
    -- 'link': agent only sends booking link; 'chat': agent books in-chat; 'both': agent decides

    CONSTRAINT agent_settings_tenant_unique UNIQUE (tenant_id)
    -- 1:1 with tenant. Only one agent config per portal.
);

-- Index: tenant lookup (primary access pattern)
CREATE INDEX idx_agent_settings_tenant_id ON agent_settings (tenant_id);

COMMENT ON TABLE agent_settings IS 'WhatsApp AI agent configuration. 1:1 with tenant. Read by internal agent module (agent.service.ts).';
COMMENT ON COLUMN agent_settings.extra_config IS 'Flexible JSONB for agent config that does not warrant its own column yet.';
COMMENT ON COLUMN agent_settings.appointment_rules IS 'Natural language scheduling rules interpreted by the agent.';


-- =============================================================================
-- 6. PATIENTS
-- Created primarily by the WhatsApp AI agent (modulo interno NestJS).
-- After first completed appointment, patient gets a read-only portal
-- with a unique access code (no password - just the code).
-- =============================================================================
CREATE TABLE patients (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                    VARCHAR(255) NOT NULL,
    phone                   VARCHAR(20)  NOT NULL,
    -- Primary identifier used by the WhatsApp agent. Brazilian format: +5511999999999
    cpf                     VARCHAR(14),
    -- Brazilian tax ID. Optional because the agent may not collect it initially.
    -- Format: "123.456.789-00" or "12345678900" (app normalizes).
    email                   VARCHAR(255),
    -- Optional. Collected if patient volunteers it.
    date_of_birth           DATE,
    -- Optional. Useful for medical context but not required at creation.
    source                  VARCHAR(50)  NOT NULL DEFAULT 'whatsapp_agent',
    -- 'whatsapp_agent' | 'manual'
    -- Tracks how the patient record was created.
    status                  VARCHAR(50)  NOT NULL DEFAULT 'active',
    -- 'active' | 'inactive'
    portal_access_code      VARCHAR(20),
    -- Unique code for patient portal access. Generated after first completed appointment.
    -- Example: "ABC-1234-XYZ". NULL until portal is activated.
    -- Globally unique (not just per tenant) because it's used for direct login.
    portal_active           BOOLEAN      NOT NULL DEFAULT false,
    -- False until first appointment is completed. Then set to true and access code generated.
    notes                   TEXT,
    -- Free-form internal notes about the patient (not clinical notes).
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT patients_source_check CHECK (source IN ('whatsapp_agent', 'manual')),
    CONSTRAINT patients_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT patients_portal_access_code_unique UNIQUE (portal_access_code)
    -- Globally unique so patients can log in with just the code.
);

-- Index: phone lookup within tenant (agent's primary patient resolution)
CREATE UNIQUE INDEX idx_patients_tenant_phone ON patients (tenant_id, phone);
-- This also enforces: one patient record per phone per tenant.

-- Index: portal access code lookup (patient portal auth)
CREATE INDEX idx_patients_portal_access_code ON patients (portal_access_code)
    WHERE portal_access_code IS NOT NULL;
-- Partial index: only index rows that have an access code (portal-active patients).

-- Index: tenant-scoped patient listing
CREATE INDEX idx_patients_tenant_id ON patients (tenant_id);

-- Index: CPF lookup within tenant (for deduplication if CPF is provided)
CREATE INDEX idx_patients_tenant_cpf ON patients (tenant_id, cpf)
    WHERE cpf IS NOT NULL;

COMMENT ON TABLE patients IS 'Patient records. Primarily created by WhatsApp agent. Portal activated after first completed appointment.';
COMMENT ON COLUMN patients.phone IS 'Primary identifier for WhatsApp. Brazilian format: +5511999999999. Unique per tenant.';
COMMENT ON COLUMN patients.portal_access_code IS 'Globally unique code for patient portal login. NULL until portal activation.';
COMMENT ON COLUMN patients.cpf IS 'Brazilian tax ID. Optional. Format: 123.456.789-00 or bare digits.';


-- =============================================================================
-- 7. APPOINTMENTS
-- Core scheduling entity. Created by agent or doctor.
-- Status lifecycle:
--   scheduled -> waiting (auto, past scheduled time) -> in_progress -> completed
--   scheduled -> cancelled (with reason)
--   scheduled -> rescheduled (creates new appointment)
--   scheduled -> no_show (patient didn't arrive)
-- =============================================================================
CREATE TABLE appointments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id              UUID         NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    date_time               TIMESTAMPTZ  NOT NULL,
    -- Scheduled start time. Stored in UTC; app converts to doctor's timezone.
    duration_minutes        INTEGER      NOT NULL DEFAULT 30,
    -- Appointment duration. Default 30 min; configurable per doctor.
    status                  VARCHAR(50)  NOT NULL DEFAULT 'scheduled',
    -- 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'no_show' | 'rescheduled' | 'cancelled'
    cancellation_reason     TEXT,
    -- Free text. Only populated when status = 'cancelled' or 'rescheduled'.
    rescheduled_to_id       UUID         REFERENCES appointments(id),
    -- If status = 'rescheduled', points to the new appointment.
    -- Self-referencing FK for appointment chain tracking.
    agent_summary           TEXT,
    -- AI-generated summary of the WhatsApp conversation that led to this appointment.
    -- Helps the doctor understand context before the consultation.
    created_by              VARCHAR(50)  NOT NULL DEFAULT 'agent',
    -- 'agent' | 'doctor'
    -- Tracks who created the appointment.
    started_at              TIMESTAMPTZ,
    -- When the doctor marked the appointment as in_progress.
    completed_at            TIMESTAMPTZ,
    -- When the appointment was marked as completed.
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT appointments_status_check CHECK (
        status IN ('scheduled', 'waiting', 'in_progress', 'completed', 'no_show', 'rescheduled', 'cancelled')
    ),
    CONSTRAINT appointments_created_by_check CHECK (created_by IN ('agent', 'doctor')),
    CONSTRAINT appointments_duration_check CHECK (duration_minutes > 0 AND duration_minutes <= 480)
    -- Max 8 hours for a single appointment (sanity check).
);

-- Index: tenant + date range (doctor's daily/weekly schedule view - THE most common query)
CREATE INDEX idx_appointments_tenant_datetime ON appointments (tenant_id, date_time);

-- Index: patient's appointment history (patient portal, doctor lookup)
CREATE INDEX idx_appointments_patient_id ON appointments (patient_id);

-- Index: filter by status within tenant (e.g., "show me today's waiting patients")
CREATE INDEX idx_appointments_tenant_status ON appointments (tenant_id, status);

-- Index: find appointments past their scheduled time that are still 'scheduled'
-- (for auto-transition to 'waiting' status)
CREATE INDEX idx_appointments_status_datetime ON appointments (status, date_time)
    WHERE status = 'scheduled';
-- Partial index: only 'scheduled' appointments need this check.

-- Index: tenant + patient + date (check for conflicts when scheduling)
CREATE INDEX idx_appointments_tenant_patient_date ON appointments (tenant_id, patient_id, date_time);

COMMENT ON TABLE appointments IS 'Core scheduling entity. Status lifecycle: scheduled -> waiting -> in_progress -> completed.';
COMMENT ON COLUMN appointments.date_time IS 'Scheduled start time in UTC. App converts to doctor timezone for display.';
COMMENT ON COLUMN appointments.agent_summary IS 'AI-generated WhatsApp conversation summary. Gives doctor context before consultation.';
COMMENT ON COLUMN appointments.rescheduled_to_id IS 'Self-referencing FK to the new appointment when this one is rescheduled.';
COMMENT ON COLUMN appointments.started_at IS 'Timestamp when doctor marked appointment as in_progress.';


-- =============================================================================
-- 8. CLINICAL NOTES
-- Doctor's notes about a consultation. Linked to a specific appointment.
-- Shared with the WhatsApp agent for post-appointment follow-up context.
-- =============================================================================
CREATE TABLE clinical_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id      UUID         NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id  UUID         NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    content         TEXT         NOT NULL,
    -- The clinical note content. Free-form text written by the doctor.
    -- Shared with the agent for follow-up context.
    -- IMPORTANT: This is medical data. Encryption at rest should be
    -- configured at the database/storage level.
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
    -- No explicit created_by column needed: clinical notes are always
    -- created by the doctor (business rule). The appointment and tenant
    -- provide sufficient attribution.
);

-- Index: appointment lookup (load notes when viewing appointment details)
CREATE INDEX idx_clinical_notes_appointment_id ON clinical_notes (appointment_id);

-- Index: patient history (load all notes for a patient - doctor and agent view)
CREATE INDEX idx_clinical_notes_patient_id ON clinical_notes (patient_id);

-- Index: tenant-scoped queries
CREATE INDEX idx_clinical_notes_tenant_id ON clinical_notes (tenant_id);

COMMENT ON TABLE clinical_notes IS 'Doctor clinical notes per appointment. Shared with agent for follow-up context. Medical data - ensure encryption at rest.';
COMMENT ON COLUMN clinical_notes.content IS 'Free-form clinical note. Always authored by the doctor.';


-- =============================================================================
-- 9. DOCUMENTS
-- Files uploaded by the doctor for a patient (prescriptions, certificates, etc.).
-- Viewable by the patient in their read-only portal.
-- =============================================================================
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id      UUID         NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id  UUID         REFERENCES appointments(id) ON DELETE SET NULL,
    -- Optional link to a specific appointment. Some documents (like general
    -- certificates) may not be tied to a specific appointment.
    type            VARCHAR(50)  NOT NULL,
    -- 'prescription' | 'certificate' | 'exam' | 'other'
    file_url        TEXT         NOT NULL,
    -- URL to the file in object storage (S3/R2/GCS).
    file_name       VARCHAR(255) NOT NULL,
    -- Original file name for display purposes.
    file_size_bytes BIGINT,
    -- File size for UI display and quota management (future).
    mime_type       VARCHAR(100),
    -- MIME type for proper rendering/download. e.g., 'application/pdf'
    description     TEXT,
    -- Optional doctor-provided description of the document.
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT documents_type_check CHECK (type IN ('prescription', 'certificate', 'exam', 'other'))
);

-- Index: patient's documents (patient portal view)
CREATE INDEX idx_documents_patient_id ON documents (patient_id);

-- Index: tenant-scoped document listing
CREATE INDEX idx_documents_tenant_id ON documents (tenant_id);

-- Index: appointment-linked documents
CREATE INDEX idx_documents_appointment_id ON documents (appointment_id)
    WHERE appointment_id IS NOT NULL;

-- Index: filter by type within tenant (e.g., "all prescriptions")
CREATE INDEX idx_documents_tenant_type ON documents (tenant_id, type);

COMMENT ON TABLE documents IS 'Doctor-uploaded files for patients. Viewable in patient read-only portal.';
COMMENT ON COLUMN documents.appointment_id IS 'Optional. Some documents are general and not tied to a specific appointment.';
COMMENT ON COLUMN documents.file_url IS 'Object storage URL (S3/R2/GCS). Never store files in the database.';


-- =============================================================================
-- 10. EVENT LOG
-- Append-only audit trail of significant actions within a tenant.
-- Usado para auditoria e debugging. O agente interno reage a eventos
-- via EventEmitter2 (zero latencia), nao por polling desta tabela.
-- =============================================================================
CREATE TABLE event_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type      VARCHAR(100) NOT NULL,
    -- Dot-notation event types for namespacing:
    -- 'appointment.created', 'appointment.status_changed', 'appointment.cancelled',
    -- 'patient.created', 'patient.updated', 'patient.portal_activated',
    -- 'note.created',
    -- 'document.uploaded',
    -- 'doctor.settings_updated', 'agent.settings_updated'
    payload         JSONB        NOT NULL DEFAULT '{}',
    -- Event-specific data. Structure varies by event_type. Examples:
    -- appointment.created: {"appointment_id": "...", "patient_id": "...", "date_time": "..."}
    -- appointment.status_changed: {"appointment_id": "...", "old_status": "...", "new_status": "..."}
    -- note.created: {"note_id": "...", "appointment_id": "...", "patient_id": "..."}
    actor_type      VARCHAR(50),
    -- 'doctor' | 'agent' | 'system' | 'agency_member'
    -- Who triggered the event. Nullable for legacy/migration events.
    actor_id        UUID,
    -- ID of the actor (doctor.id, agency_member.id, or NULL for agent/system).
    -- Not a FK because it references different tables based on actor_type.
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
    -- No updated_at: events are immutable (append-only).
);

-- Index: tenant + chronological order (audit queries: "give me events since X")
CREATE INDEX idx_event_log_tenant_created ON event_log (tenant_id, created_at);

-- Index: filter by event type within tenant
CREATE INDEX idx_event_log_tenant_event_type ON event_log (tenant_id, event_type);

-- Index: search by event type globally (agency admin monitoring)
CREATE INDEX idx_event_log_event_type ON event_log (event_type, created_at);

COMMENT ON TABLE event_log IS 'Append-only audit trail. Immutable - no updated_at. Agente interno usa EventEmitter2 para reatividade, esta tabela serve como historico de auditoria.';
COMMENT ON COLUMN event_log.event_type IS 'Dot-notation namespace: appointment.created, patient.updated, note.created, etc.';
COMMENT ON COLUMN event_log.payload IS 'Event-specific JSONB data. Structure varies by event_type.';
COMMENT ON COLUMN event_log.actor_id IS 'Polymorphic: references doctor.id or agency_member.id based on actor_type. Not a FK.';


-- =============================================================================
-- 11. BOOKING TOKENS
-- Temporary tokens for public booking page access. Generated pelo agente interno
-- (bookingService.generateToken()) quando envia um link de agendamento ao paciente.
-- Tokens expire after 24h and are single-use.
-- =============================================================================
CREATE TABLE booking_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token           VARCHAR(64)  NOT NULL,
    -- Cryptographically random token embedded in the booking page URL.
    phone           VARCHAR(20),
    -- Phone number of the patient (optional). O agente interno pode incluir
    -- o telefone para pre-preencher o formulario de agendamento.
    expires_at      TIMESTAMPTZ  NOT NULL,
    -- Token expiration. Default: now() + 24 hours.
    used            BOOLEAN      NOT NULL DEFAULT false,
    -- Set to true once the token has been used to book an appointment.
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT booking_tokens_token_unique UNIQUE (token)
);

-- Index: token lookup for validation (only unused tokens matter)
CREATE INDEX idx_booking_tokens_token ON booking_tokens (token) WHERE used = false;

-- Index: expiry-based cleanup (DELETE WHERE expires_at < now() - interval '7 days')
CREATE INDEX idx_booking_tokens_expires_at ON booking_tokens (expires_at);

COMMENT ON TABLE booking_tokens IS 'Temporary tokens for public booking page. Generated pelo agente interno, expire in 24h, single-use.';
COMMENT ON COLUMN booking_tokens.token IS 'Cryptographically random token for booking URL. Unique, single-use.';
COMMENT ON COLUMN booking_tokens.phone IS 'Optional patient phone from agente interno. Used to pre-fill the booking form.';


-- =============================================================================
-- HELPER: updated_at trigger function
-- Automatically updates the updated_at column on row modification.
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON agency_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON invites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON doctors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON agent_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinical_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: event_log intentionally has NO updated_at trigger (immutable table).
-- Note: booking_tokens has no updated_at column (tokens are created and consumed, not edited).


-- =============================================================================
-- 12. CONVERSATIONS
-- =============================================================================
-- WhatsApp conversation state per patient phone number, scoped to tenant.
-- Used exclusively by the agent/ module (conversation.service.ts).
-- =============================================================================
CREATE TABLE conversations (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone           VARCHAR(20)  NOT NULL,
    messages        JSONB        NOT NULL DEFAULT '[]',
    -- Format: [{ role: 'user'|'assistant', content: '...', timestamp: 'ISO8601' }]
    -- Policy: keep last 20 messages; older ones are trimmed in-app (not in DB)
    last_message_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT conversations_tenant_phone UNIQUE (tenant_id, phone)
);

-- Index: primary access pattern (getOrCreate by tenant + phone)
CREATE INDEX idx_conversations_tenant_phone ON conversations (tenant_id, phone);

-- Index: cleanup of stale conversations (inactive sessions)
CREATE INDEX idx_conversations_last_message_at ON conversations (last_message_at);

COMMENT ON TABLE conversations IS 'WhatsApp agent conversation state. One row per patient phone per tenant. Trimmed to last 20 messages for LLM context.';

CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
