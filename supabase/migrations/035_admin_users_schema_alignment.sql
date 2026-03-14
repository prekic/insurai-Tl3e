-- ============================================================================
-- Admin Users Schema Alignment
-- Migration: 035_admin_users_schema_alignment.sql
-- Description: Adds missing columns to admin_users table in production
-- ============================================================================

-- Safely add missing columns to match 005b_admin_tables.sql
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Add comment explaining this migration
COMMENT ON COLUMN admin_users.display_name IS 'Schema alignment: Added from 005b_admin_tables.sql';
COMMENT ON COLUMN admin_users.failed_login_attempts IS 'Schema alignment: Added from 005b_admin_tables.sql';
COMMENT ON COLUMN admin_users.locked_until IS 'Schema alignment: Added from 005b_admin_tables.sql';
