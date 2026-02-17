-- ============================================================================
-- Translation System Tables
-- Migration: 017_translation_system.sql
-- Description: Creates tables for admin-managed translations with multi-language support
-- Date: 2026-02-12
-- ============================================================================

-- ===========================================
-- 1. Translation Locales (available languages)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.translation_locales (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  native_name VARCHAR(50) NOT NULL,
  flag VARCHAR(10) DEFAULT '🌐',
  is_rtl BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure exactly one default locale
CREATE UNIQUE INDEX IF NOT EXISTS idx_translation_locales_default
  ON public.translation_locales (is_default) WHERE is_default = TRUE;

-- ===========================================
-- 2. Translation Keys (all translatable strings)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.translation_keys (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  section VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  description TEXT,
  context TEXT,
  max_length INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT translation_keys_section_key_unique UNIQUE (section, key)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_translation_keys_section ON public.translation_keys(section);

-- ===========================================
-- 3. Translations (actual translated values)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.translations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES public.translation_keys(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL REFERENCES public.translation_locales(code) ON DELETE CASCADE,
  value TEXT NOT NULL,
  is_reviewed BOOLEAN DEFAULT FALSE,
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT translations_key_locale_unique UNIQUE (key_id, locale)
);

-- Indexes for fast locale-based queries
CREATE INDEX IF NOT EXISTS idx_translations_locale ON public.translations(locale);
CREATE INDEX IF NOT EXISTS idx_translations_key_id ON public.translations(key_id);

-- ===========================================
-- 4. Translation Audit Log
-- ===========================================
CREATE TABLE IF NOT EXISTS public.translation_audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  translation_id UUID REFERENCES public.translations(id) ON DELETE SET NULL,
  locale VARCHAR(10) NOT NULL,
  section VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  previous_value TEXT,
  new_value TEXT NOT NULL,
  changed_by UUID REFERENCES public.admin_users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_translation_audit_changed_at ON public.translation_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_translation_audit_locale ON public.translation_audit_log(locale);

-- ===========================================
-- 5. Auto-update triggers for updated_at
-- ===========================================
CREATE OR REPLACE FUNCTION update_translation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_translation_locales_updated
  BEFORE UPDATE ON public.translation_locales
  FOR EACH ROW EXECUTE FUNCTION update_translation_updated_at();

CREATE TRIGGER trigger_translations_updated
  BEFORE UPDATE ON public.translations
  FOR EACH ROW EXECUTE FUNCTION update_translation_updated_at();

-- ===========================================
-- 6. Audit trigger for translations
-- ===========================================
CREATE OR REPLACE FUNCTION log_translation_change()
RETURNS TRIGGER AS $$
DECLARE
  v_section VARCHAR(50);
  v_key VARCHAR(100);
BEGIN
  -- Look up section and key
  SELECT section, key INTO v_section, v_key
  FROM public.translation_keys WHERE id = NEW.key_id;

  -- Only log if value actually changed
  IF TG_OP = 'UPDATE' AND OLD.value = NEW.value THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.translation_audit_log (
    translation_id, locale, section, key,
    previous_value, new_value, changed_by
  ) VALUES (
    NEW.id, NEW.locale, v_section, v_key,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.value ELSE NULL END,
    NEW.value, NEW.updated_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_translation_audit
  AFTER INSERT OR UPDATE ON public.translations
  FOR EACH ROW EXECUTE FUNCTION log_translation_change();

-- ===========================================
-- 7. Row Level Security
-- ===========================================
ALTER TABLE public.translation_locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_audit_log ENABLE ROW LEVEL SECURITY;

-- Public read access for locales and translations (needed by frontend)
CREATE POLICY "Anyone can read translation locales"
  ON public.translation_locales FOR SELECT USING (true);

CREATE POLICY "Anyone can read translation keys"
  ON public.translation_keys FOR SELECT USING (true);

CREATE POLICY "Anyone can read translations"
  ON public.translations FOR SELECT USING (true);

-- Admin-only write access (managed via service_role key on server)
-- No INSERT/UPDATE/DELETE policies for anon — all writes go through server with service_role

-- Admin read access for audit log
CREATE POLICY "Anyone can read translation audit log"
  ON public.translation_audit_log FOR SELECT USING (true);

-- ===========================================
-- 8. Translation version tracker
-- ===========================================
-- A simple counter that increments on any translation change
-- Used by clients for cache invalidation
CREATE TABLE IF NOT EXISTS public.translation_metadata (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.translation_metadata (key, value) VALUES
  ('version', '"1"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Function to increment version on any translation change
CREATE OR REPLACE FUNCTION increment_translation_version()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.translation_metadata
  SET value = to_jsonb(((value #>> '{}')::int + 1)::text),
      updated_at = NOW()
  WHERE key = 'version';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_translation_version_increment
  AFTER INSERT OR UPDATE OR DELETE ON public.translations
  FOR EACH STATEMENT EXECUTE FUNCTION increment_translation_version();

ALTER TABLE public.translation_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read translation metadata"
  ON public.translation_metadata FOR SELECT USING (true);
