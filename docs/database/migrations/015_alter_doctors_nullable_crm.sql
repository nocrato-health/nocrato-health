-- =============================================================================
-- 015_alter_doctors_nullable_crm.sql
-- Table: doctors
-- Purpose: Make crm and crm_state nullable to allow invite acceptance before
--          onboarding. The doctor fills these fields during Epic 3 (onboarding).
-- Depends on: 004_create_doctors.sql
-- =============================================================================

ALTER TABLE doctors ALTER COLUMN crm DROP NOT NULL;
ALTER TABLE doctors ALTER COLUMN crm_state DROP NOT NULL;
