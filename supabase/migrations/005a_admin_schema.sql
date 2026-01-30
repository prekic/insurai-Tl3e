-- ============================================================================
-- Admin Schema Migration
-- Adds tables for admin users, configuration, audit logs, and security
-- ============================================================================

-- ============================================================================
-- ADMIN USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'super_admin')) DEFAULT 'admin',
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
  display_name TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,
  login_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.admin_users(id),
  suspended_at TIMESTAMPTZ,
  suspended_by UUID REFERENCES public.admin_users(id),
  suspension_reason TEXT
);

-- Index for quick lookups
CREATE INDEX idx_admin_users_email ON public.admin_users(email);
CREATE INDEX idx_admin_users_role ON public.admin_users(role);
CREATE INDEX idx_admin_users_status ON public.admin_users(status);

-- ============================================================================
-- APP CONFIGURATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL CHECK (category IN ('ai', 'rate_limits', 'security', 'features', 'ui', 'notifications', 'system')),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  is_secret BOOLEAN DEFAULT false,
  is_editable BOOLEAN DEFAULT true,
  validation_rules JSONB,
  modified_by UUID REFERENCES public.admin_users(id),
  modified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, key)
);

-- Index for category lookups
CREATE INDEX idx_app_configs_category ON public.app_configs(category);

-- ============================================================================
-- CONFIG CHANGE HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.config_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id UUID REFERENCES public.app_configs(id) ON DELETE CASCADE,
  previous_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES public.admin_users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  ip_address INET
);

-- Index for config history lookups
CREATE INDEX idx_config_history_config_id ON public.config_history(config_id);
CREATE INDEX idx_config_history_changed_at ON public.config_history(changed_at DESC);

-- ============================================================================
-- FEATURE FLAGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT false,
  enabled_percentage INTEGER CHECK (enabled_percentage >= 0 AND enabled_percentage <= 100),
  enabled_for_roles TEXT[] DEFAULT '{}',
  enabled_for_users UUID[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.admin_users(id)
);

-- ============================================================================
-- AUDIT LOGS TABLE (Immutable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  actor_id UUID REFERENCES public.admin_users(id),
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'login', 'logout', 'enable', 'disable', 'approve', 'reject', 'export', 'import')),
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  previous_state JSONB,
  new_state JSONB,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for audit log queries
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id, timestamp DESC);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- Make audit logs append-only (no updates or deletes)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- ============================================================================
-- SECURITY EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'failed_login', 'brute_force', 'rate_limit_exceeded', 'suspicious_activity',
    'unauthorized_access', 'ip_blocked', 'token_revoked', 'permission_denied',
    'data_export', 'config_change', 'admin_action'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  user_id UUID,
  ip_address INET,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.admin_users(id),
  resolution_notes TEXT
);

-- Indexes for security event queries
CREATE INDEX idx_security_events_timestamp ON public.security_events(timestamp DESC);
CREATE INDEX idx_security_events_severity ON public.security_events(severity, resolved);
CREATE INDEX idx_security_events_type ON public.security_events(event_type);
CREATE INDEX idx_security_events_ip ON public.security_events(ip_address);

-- ============================================================================
-- BLOCKED IPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blocked_ips (
  ip INET PRIMARY KEY,
  reason TEXT NOT NULL,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_permanent BOOLEAN DEFAULT false,
  block_count INTEGER DEFAULT 1,
  created_by UUID REFERENCES public.admin_users(id),
  last_attempt_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for expiration cleanup
CREATE INDEX idx_blocked_ips_expires ON public.blocked_ips(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- PROMPT TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('extraction', 'chat', 'ocr', 'analysis', 'other')),
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT false,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  default_provider TEXT CHECK (default_provider IN ('openai', 'anthropic', 'google')),
  default_model TEXT,
  parameters JSONB DEFAULT '{}'::jsonb,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.admin_users(id)
);

-- Indexes
CREATE INDEX idx_prompt_templates_category ON public.prompt_templates(category);
CREATE INDEX idx_prompt_templates_active ON public.prompt_templates(category, is_active) WHERE is_active = true;

-- ============================================================================
-- PROMPT VERSION HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES public.prompt_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  variables JSONB,
  parameters JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.admin_users(id),
  change_notes TEXT
);

-- Index for version lookups
CREATE INDEX idx_prompt_versions_template ON public.prompt_versions(template_id, version DESC);

-- ============================================================================
-- AI REQUEST LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_request_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id UUID,
  session_id TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google')),
  model TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('extraction', 'chat', 'ocr', 'analysis', 'other')),
  endpoint TEXT,
  policy_id UUID,
  document_id UUID,
  prompt_template_id UUID REFERENCES public.prompt_templates(id),
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  input_cost DECIMAL(10, 6) DEFAULT 0,
  output_cost DECIMAL(10, 6) DEFAULT 0,
  total_cost DECIMAL(10, 6) DEFAULT 0,
  response_time_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error', 'timeout', 'rate_limited')),
  error_message TEXT,
  error_code TEXT,
  client_ip INET,
  user_agent TEXT
);

-- Indexes for AI request queries
CREATE INDEX idx_ai_requests_timestamp ON public.ai_request_logs(timestamp DESC);
CREATE INDEX idx_ai_requests_user ON public.ai_request_logs(user_id, timestamp DESC);
CREATE INDEX idx_ai_requests_provider ON public.ai_request_logs(provider, timestamp DESC);
CREATE INDEX idx_ai_requests_operation ON public.ai_request_logs(operation, timestamp DESC);
CREATE INDEX idx_ai_requests_status ON public.ai_request_logs(status) WHERE status = 'error';

-- ============================================================================
-- COST BUDGETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cost_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  budget_type TEXT NOT NULL CHECK (budget_type IN ('daily', 'weekly', 'monthly', 'total')),
  limit_amount DECIMAL(10, 2) NOT NULL,
  current_usage DECIMAL(10, 2) DEFAULT 0,
  alert_threshold_percent INTEGER DEFAULT 80 CHECK (alert_threshold_percent >= 0 AND alert_threshold_percent <= 100),
  action_on_exceed TEXT CHECK (action_on_exceed IN ('alert', 'throttle', 'block')),
  applies_to TEXT CHECK (applies_to IN ('all', 'extraction', 'chat', 'ocr')),
  reset_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ADMIN SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES public.admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  refresh_token_hash TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.admin_users(id),
  revoke_reason TEXT
);

-- Indexes for session lookups
CREATE INDEX idx_admin_sessions_admin ON public.admin_sessions(admin_id);
CREATE INDEX idx_admin_sessions_token ON public.admin_sessions(token_hash);
CREATE INDEX idx_admin_sessions_expires ON public.admin_sessions(expires_at) WHERE revoked_at IS NULL;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Service role can do anything (for backend)
CREATE POLICY "Service role full access on admin_users" ON public.admin_users
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on app_configs" ON public.app_configs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on config_history" ON public.config_history
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on feature_flags" ON public.feature_flags
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on audit_logs" ON public.audit_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on security_events" ON public.security_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on blocked_ips" ON public.blocked_ips
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on prompt_templates" ON public.prompt_templates
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on prompt_versions" ON public.prompt_versions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on ai_request_logs" ON public.ai_request_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on cost_budgets" ON public.cost_budgets
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on admin_sessions" ON public.admin_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_configs_updated_at
  BEFORE UPDATE ON public.app_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prompt_templates_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cost_budgets_updated_at
  BEFORE UPDATE ON public.cost_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INSERT DEFAULT CONFIGURATIONS
-- ============================================================================

-- AI Configuration defaults
INSERT INTO public.app_configs (category, key, value, value_type, description, is_editable) VALUES
  ('ai', 'default_provider', '"openai"', 'string', 'Default AI provider for extraction', true),
  ('ai', 'chat_model', '"gpt-4o-mini"', 'string', 'Model used for policy chat', true),
  ('ai', 'extraction_model', '"gpt-4o"', 'string', 'Model used for policy extraction', true),
  ('ai', 'max_tokens_chat', '2048', 'number', 'Maximum tokens for chat responses', true),
  ('ai', 'max_tokens_extraction', '4096', 'number', 'Maximum tokens for extraction', true),
  ('ai', 'temperature', '0.3', 'number', 'AI temperature (0-1, lower = more deterministic)', true)
ON CONFLICT (category, key) DO NOTHING;

-- Rate limit defaults
INSERT INTO public.app_configs (category, key, value, value_type, description, is_editable) VALUES
  ('rate_limits', 'chat_requests_per_hour', '60', 'number', 'Max chat requests per hour per user', true),
  ('rate_limits', 'extraction_requests_per_hour', '20', 'number', 'Max extraction requests per hour per user', true),
  ('rate_limits', 'ocr_requests_per_hour', '30', 'number', 'Max OCR requests per hour per user', true)
ON CONFLICT (category, key) DO NOTHING;

-- Security defaults
INSERT INTO public.app_configs (category, key, value, value_type, description, is_editable) VALUES
  ('security', 'max_file_size_mb', '25', 'number', 'Maximum upload file size in MB', true),
  ('security', 'allowed_file_types', '["application/pdf"]', 'json', 'Allowed MIME types for upload', true),
  ('security', 'session_timeout_minutes', '60', 'number', 'User session timeout in minutes', true),
  ('security', 'max_login_attempts', '5', 'number', 'Max failed login attempts before lockout', true),
  ('security', 'admin_session_timeout_minutes', '30', 'number', 'Admin session timeout in minutes', true)
ON CONFLICT (category, key) DO NOTHING;

-- Feature defaults
INSERT INTO public.app_configs (category, key, value, value_type, description, is_editable) VALUES
  ('features', 'enable_chat', 'true', 'boolean', 'Enable AI chat feature', true),
  ('features', 'enable_ocr', 'true', 'boolean', 'Enable OCR for scanned documents', true),
  ('features', 'enable_gap_analysis', 'true', 'boolean', 'Enable coverage gap analysis', true),
  ('features', 'enable_policy_comparison', 'true', 'boolean', 'Enable multi-policy comparison', true),
  ('features', 'enable_pdf_export', 'true', 'boolean', 'Enable PDF export feature', true)
ON CONFLICT (category, key) DO NOTHING;

-- Default feature flags
INSERT INTO public.feature_flags (id, name, description, enabled) VALUES
  ('new_extraction_pipeline', 'New Extraction Pipeline', 'Use the combined document processing pipeline for extractions', false),
  ('pii_redaction', 'PII Redaction', 'Automatically detect and redact PII from documents', true),
  ('multi_provider_fallback', 'Multi-Provider Fallback', 'Automatically fallback to secondary AI provider on failure', true),
  ('advanced_gap_analysis', 'Advanced Gap Analysis', 'Enhanced gap detection with regional benchmarks', true),
  ('policy_amendments', 'Policy Amendments', 'Track policy amendments and version history', true)
ON CONFLICT (id) DO NOTHING;

-- Default prompt templates
INSERT INTO public.prompt_templates (name, description, category, is_active, system_prompt, user_prompt_template, default_provider, default_model, parameters) VALUES
  (
    'Policy Extraction (Default)',
    'Standard prompt for extracting policy data from Turkish insurance documents',
    'extraction',
    true,
    'You are an expert Turkish insurance document analyzer. Extract structured data from the provided policy document. Always respond in valid JSON format following the exact schema provided. Pay special attention to Turkish-specific terms and formats.',
    'Extract all relevant information from this Turkish insurance policy document:\n\n{{document_text}}\n\nReturn the data in the following JSON structure:\n{{json_schema}}',
    'openai',
    'gpt-4o',
    '{"temperature": 0.1, "maxTokens": 4096}'::jsonb
  ),
  (
    'Policy Chat (Default)',
    'Standard prompt for answering questions about insurance policies',
    'chat',
    true,
    'You are an expert Turkish insurance advisor assistant. Help users understand their insurance policies. Answer questions clearly and concisely in the same language as the user''s question (Turkish or English). When referencing specific coverages, limits, or exclusions, cite the relevant parts of the policy. If you''re unsure about something, say so rather than making assumptions.',
    'Policy Context:\n{{policy_context}}\n\nUser Question: {{user_message}}',
    'openai',
    'gpt-4o-mini',
    '{"temperature": 0.5, "maxTokens": 2048}'::jsonb
  ),
  (
    'OCR Correction (Default)',
    'Prompt for correcting OCR errors in Turkish documents',
    'ocr',
    true,
    'You are an expert at correcting OCR errors in Turkish insurance documents. Fix common OCR mistakes while preserving the original meaning and structure. Pay attention to Turkish characters (ı, İ, ğ, Ğ, ü, Ü, ş, Ş, ö, Ö, ç, Ç) and numbers.',
    'Correct any OCR errors in this Turkish insurance document text:\n\n{{raw_text}}\n\nReturn only the corrected text without explanations.',
    'openai',
    'gpt-4o-mini',
    '{"temperature": 0.2, "maxTokens": 8192}'::jsonb
  )
ON CONFLICT DO NOTHING;
