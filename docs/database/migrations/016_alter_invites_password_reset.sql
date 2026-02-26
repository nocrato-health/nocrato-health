-- =============================================================================
-- Migration 016: alter_invites_password_reset
-- Purpose: Support password_reset flow using the polymorphic invites table.
-- Changes:
--   1. Drop old CHECK constraint on invites.type (only allowed agency_member | doctor)
--   2. Add new CHECK constraint that also allows 'password_reset'
--   3. Make invites.invited_by nullable — password reset is self-initiated,
--      there is no agency member acting as inviter
-- =============================================================================

-- 1. Drop old type constraint
ALTER TABLE invites
    DROP CONSTRAINT invites_type_check;

-- 2. Add new type constraint including 'password_reset'
ALTER TABLE invites
    ADD CONSTRAINT invites_type_check
    CHECK (type IN ('agency_member', 'doctor', 'password_reset'));

-- 3. Make invited_by nullable (password reset has no inviter)
ALTER TABLE invites
    ALTER COLUMN invited_by DROP NOT NULL;

-- Comments
COMMENT ON COLUMN invites.invited_by IS
    'Agency member who created the invite. NULL for password_reset type (self-service flow).';
COMMENT ON COLUMN invites.type IS
    'agency_member | doctor | password_reset';
