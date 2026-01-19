-- ============================================================================
-- Admin Authentication & Management Tables
-- Migration: 005_admin_tables.sql
-- Description: Creates all tables required for admin authentication, sessions,
--              security logging, and audit functionality
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ADMIN USERS TABLE
-- Stores admin user accounts separate from regular Supabase auth users
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  display_name TEXT,
  permissions TEXT[] DEFAULT '{}',
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  login_count INTEGER DEFAULT 0,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_status ON admin_users(status);

-- ============================================================================
-- ADMIN SESSIONS TABLE
-- Tracks active admin sessions for token validation and revocation
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoke_reason TEXT
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

-- ============================================================================
-- SECURITY EVENTS TABLE
-- Logs security-related events (login attempts, suspicious activity, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON security_events(resolved);

-- ============================================================================
-- AUDIT LOGS TABLE
-- Comprehensive audit trail for all admin actions
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  actor_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  previous_state JSONB,
  new_state JSONB,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  session_id UUID REFERENCES admin_sessions(id) ON DELETE SET NULL,
  reason TEXT
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);

-- ============================================================================
-- APP CONFIGS TABLE
-- Application configuration settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL, -- JSON-encoded value
  value_type TEXT NOT NULL DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  is_secret BOOLEAN DEFAULT FALSE,
  is_editable BOOLEAN DEFAULT TRUE,
  modified_by TEXT,
  modified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, key)
);

CREATE INDEX IF NOT EXISTS idx_app_configs_category ON app_configs(category);

-- ============================================================================
-- CONFIG HISTORY TABLE
-- Tracks changes to configuration values
-- ============================================================================

CREATE TABLE IF NOT EXISTS config_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id UUID NOT NULL REFERENCES app_configs(id) ON DELETE CASCADE,
  previous_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_config_history_config_id ON config_history(config_id);

-- ============================================================================
-- FEATURE FLAGS TABLE
-- Feature flag management
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  enabled_percentage INTEGER,
  enabled_for_roles TEXT[] DEFAULT '{}',
  enabled_for_users TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- ============================================================================
-- BLOCKED IPS TABLE
-- IP blocking for security
-- ============================================================================

CREATE TABLE IF NOT EXISTS blocked_ips (
  ip TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_permanent BOOLEAN DEFAULT FALSE,
  block_count INTEGER DEFAULT 1,
  created_by TEXT,
  last_attempt_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires_at ON blocked_ips(expires_at);

-- ============================================================================
-- HELPER FUNCTION: Increment login count
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_login_count(row_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE admin_users
  SET login_count = COALESCE(login_count, 0) + 1
  WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Update updated_at on admin_users
-- ============================================================================

CREATE OR REPLACE FUNCTION update_admin_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_admin_users_updated_at ON admin_users;
CREATE TRIGGER trigger_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_users_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Admin tables should only be accessible via service role key
-- ============================================================================

-- Enable RLS on all admin tables
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (server-side operations)
CREATE POLICY admin_users_service_role ON admin_users FOR ALL TO service_role USING (true);
CREATE POLICY admin_sessions_service_role ON admin_sessions FOR ALL TO service_role USING (true);
CREATE POLICY security_events_service_role ON security_events FOR ALL TO service_role USING (true);
CREATE POLICY audit_logs_service_role ON audit_logs FOR ALL TO service_role USING (true);
CREATE POLICY app_configs_service_role ON app_configs FOR ALL TO service_role USING (true);
CREATE POLICY config_history_service_role ON config_history FOR ALL TO service_role USING (true);
CREATE POLICY feature_flags_service_role ON feature_flags FOR ALL TO service_role USING (true);
CREATE POLICY blocked_ips_service_role ON blocked_ips FOR ALL TO service_role USING (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE admin_users IS 'Admin user accounts for the admin dashboard';
COMMENT ON TABLE admin_sessions IS 'Active admin sessions for JWT token validation';
COMMENT ON TABLE security_events IS 'Security event logging for monitoring and alerting';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all admin actions';
COMMENT ON TABLE app_configs IS 'Application configuration settings';
COMMENT ON TABLE feature_flags IS 'Feature flag management';
COMMENT ON TABLE blocked_ips IS 'IP blocking for security';

-- ============================================================================
-- SAMPLE DATA: Create initial super admin (password: secure-password)
-- Hash generated with bcryptjs using 12 rounds
-- IMPORTANT: Change this password immediately after first login!
-- ============================================================================

-- Only insert if no admin users exist
INSERT INTO admin_users (email, password_hash, role, status, display_name)
SELECT
  'admin@insurai.com',
  '$2a$12$R1MB4BsJDNrZPEQqq/UH8uaWZeTx59pOFeI8FmUGJWkvVorsslJ.2',
  'super_admin',
  'active',
  'System Administrator'
WHERE NOT EXISTS (
  SELECT 1 FROM admin_users WHERE email = 'admin@insurai.com'
);
