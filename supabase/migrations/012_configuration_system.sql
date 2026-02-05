-- ============================================================================
-- Configuration System Tables
-- Migration: 012_configuration_system.sql
-- Description: Creates tables for admin settings, user preferences, and market data
-- Date: 2026-02-05
-- ============================================================================

-- ===========================================
-- 1. App Settings (Admin-managed configuration)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  value_type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, object, array
  schema JSONB, -- JSON Schema for validation
  description TEXT,
  description_tr TEXT,
  is_sensitive BOOLEAN DEFAULT FALSE,
  is_readonly BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  min_value NUMERIC,
  max_value NUMERIC,
  allowed_values JSONB, -- For enum-like fields
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT app_settings_category_key_unique UNIQUE (category, key)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON public.app_settings(category);
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON public.app_settings(key);

-- ===========================================
-- 2. Settings Audit Log
-- ===========================================
CREATE TABLE IF NOT EXISTS public.settings_audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  setting_id UUID REFERENCES public.app_settings(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES public.admin_users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  ip_address INET,
  user_agent TEXT
);

-- Index for querying audit history
CREATE INDEX IF NOT EXISTS idx_settings_audit_setting ON public.settings_audit_log(setting_id);
CREATE INDEX IF NOT EXISTS idx_settings_audit_category ON public.settings_audit_log(category);
CREATE INDEX IF NOT EXISTS idx_settings_audit_changed_at ON public.settings_audit_log(changed_at DESC);

-- ===========================================
-- 3. User Preferences
-- ===========================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  category VARCHAR(50) NOT NULL,
  preferences JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT user_preferences_user_category_unique UNIQUE (user_id, category)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON public.user_preferences(user_id);

-- ===========================================
-- 4. Market Benchmarks (versioned)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.market_benchmarks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  policy_type VARCHAR(50) NOT NULL,
  coverage_type VARCHAR(100) NOT NULL,
  coverage_name_tr VARCHAR(100),
  region_code VARCHAR(20) DEFAULT 'TR', -- 'TR' for national, or region code
  year INT NOT NULL,
  min_limit NUMERIC,
  typical_limit NUMERIC,
  max_limit NUMERIC,
  min_deductible NUMERIC DEFAULT 0,
  typical_deductible NUMERIC,
  max_deductible NUMERIC,
  inclusion_rate NUMERIC, -- 0-100 percentage
  importance VARCHAR(20) DEFAULT 'standard', -- critical, standard, optional
  source VARCHAR(200),
  notes TEXT,
  effective_date DATE,
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT market_benchmarks_unique UNIQUE (policy_type, coverage_type, region_code, year, version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_market_benchmarks_type ON public.market_benchmarks(policy_type);
CREATE INDEX IF NOT EXISTS idx_market_benchmarks_year ON public.market_benchmarks(year);
CREATE INDEX IF NOT EXISTS idx_market_benchmarks_active ON public.market_benchmarks(is_active) WHERE is_active = TRUE;

-- ===========================================
-- 5. Insurance Providers
-- ===========================================
CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  name_tr VARCHAR(200),
  market_share NUMERIC, -- percentage 0-100
  customer_rating NUMERIC, -- 0-5 stars
  established_year INT,
  headquarters VARCHAR(100),
  website VARCHAR(200),
  logo_url VARCHAR(500),
  specialties JSONB DEFAULT '[]', -- ['kasko', 'health', etc.]
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_insurance_providers_active ON public.insurance_providers(is_active) WHERE is_active = TRUE;

-- ===========================================
-- 6. Regional Risk Factors
-- ===========================================
CREATE TABLE IF NOT EXISTS public.regional_factors (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  region_code VARCHAR(20) NOT NULL,
  region_name VARCHAR(100) NOT NULL,
  region_name_tr VARCHAR(100),
  policy_type VARCHAR(50) NOT NULL DEFAULT 'all', -- 'all' or specific type
  risk_factor NUMERIC NOT NULL, -- multiplier (e.g., 1.15 for 15% higher)
  year INT NOT NULL,
  source VARCHAR(200),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT regional_factors_unique UNIQUE (region_code, policy_type, year)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_regional_factors_region ON public.regional_factors(region_code);
CREATE INDEX IF NOT EXISTS idx_regional_factors_year ON public.regional_factors(year);

-- ===========================================
-- 7. Feature Flags
-- ===========================================
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  rollout_percentage INT DEFAULT 0, -- 0-100
  user_segments JSONB DEFAULT '[]', -- ['beta', 'premium', etc.]
  conditions JSONB DEFAULT '{}', -- Additional conditions
  expires_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Row Level Security
-- ===========================================

-- App Settings: Admin only (enforced at API level)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage settings"
  ON public.app_settings
  FOR ALL
  USING (true); -- Enforced at API level via admin middleware

-- Settings Audit Log: Admin only
ALTER TABLE public.settings_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view audit logs"
  ON public.settings_audit_log
  FOR SELECT
  USING (true); -- Enforced at API level

-- User Preferences: Users can only access their own
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
  ON public.user_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

-- Market Benchmarks: Public read, admin write
ALTER TABLE public.market_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active benchmarks"
  ON public.market_benchmarks
  FOR SELECT
  USING (is_active = true);

-- Insurance Providers: Public read, admin write
ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active providers"
  ON public.insurance_providers
  FOR SELECT
  USING (is_active = true);

-- Regional Factors: Public read, admin write
ALTER TABLE public.regional_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active factors"
  ON public.regional_factors
  FOR SELECT
  USING (is_active = true);

-- Feature Flags: Admin only
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage feature flags"
  ON public.feature_flags
  FOR ALL
  USING (true); -- Enforced at API level

-- ===========================================
-- Triggers for updated_at
-- ===========================================

-- Create trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- App Settings
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User Preferences
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Market Benchmarks
DROP TRIGGER IF EXISTS update_market_benchmarks_updated_at ON public.market_benchmarks;
CREATE TRIGGER update_market_benchmarks_updated_at
  BEFORE UPDATE ON public.market_benchmarks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insurance Providers
DROP TRIGGER IF EXISTS update_insurance_providers_updated_at ON public.insurance_providers;
CREATE TRIGGER update_insurance_providers_updated_at
  BEFORE UPDATE ON public.insurance_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Regional Factors
DROP TRIGGER IF EXISTS update_regional_factors_updated_at ON public.regional_factors;
CREATE TRIGGER update_regional_factors_updated_at
  BEFORE UPDATE ON public.regional_factors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Feature Flags
DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- Audit Trigger for Settings Changes
-- ===========================================
CREATE OR REPLACE FUNCTION audit_settings_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.value IS DISTINCT FROM NEW.value THEN
    INSERT INTO public.settings_audit_log (
      setting_id,
      category,
      key,
      previous_value,
      new_value,
      changed_by
    ) VALUES (
      NEW.id,
      NEW.category,
      NEW.key,
      OLD.value,
      NEW.value,
      NEW.updated_by
    );
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS audit_app_settings_changes ON public.app_settings;
CREATE TRIGGER audit_app_settings_changes
  AFTER UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION audit_settings_change();

-- ===========================================
-- Comments for documentation
-- ===========================================
COMMENT ON TABLE public.app_settings IS 'Admin-configurable application settings';
COMMENT ON TABLE public.settings_audit_log IS 'Audit trail for settings changes';
COMMENT ON TABLE public.user_preferences IS 'Per-user preference settings';
COMMENT ON TABLE public.market_benchmarks IS 'Insurance market benchmark data by policy type';
COMMENT ON TABLE public.insurance_providers IS 'Turkish insurance provider directory';
COMMENT ON TABLE public.regional_factors IS 'Regional risk adjustment factors';
COMMENT ON TABLE public.feature_flags IS 'Feature flag configuration for gradual rollouts';
