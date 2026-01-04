-- InsurAI Security Fix Migration
-- Fixes "mutable search_path" security warnings on functions
-- Run this in Supabase SQL Editor after the initial migrations

-- =============================================================================
-- FIX FUNCTION SECURITY: Set immutable search_path
-- =============================================================================

-- Fix update_policy_search_vector function
CREATE OR REPLACE FUNCTION public.update_policy_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.policy_number, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.provider, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.insured_person, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.type_tr, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.location, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(NEW.raw_data->>'insuranceLine', '')), 'C');
  RETURN NEW;
END;
$$;

-- Fix search_policies function
CREATE OR REPLACE FUNCTION public.search_policies(search_query TEXT)
RETURNS SETOF public.policies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.policies
  WHERE
    user_id = auth.uid()
    AND (
      search_vector @@ plainto_tsquery('simple', search_query)
      OR policy_number ILIKE '%' || search_query || '%'
      OR provider ILIKE '%' || search_query || '%'
      OR insured_person ILIKE '%' || search_query || '%'
    )
  ORDER BY
    CASE WHEN search_vector @@ plainto_tsquery('simple', search_query)
      THEN ts_rank(search_vector, plainto_tsquery('simple', search_query))
      ELSE 0
    END DESC,
    created_at DESC;
END;
$$;

-- Fix get_policy_history function
CREATE OR REPLACE FUNCTION public.get_policy_history(p_policy_id UUID)
RETURNS TABLE (
  version_number INTEGER,
  change_type TEXT,
  change_summary TEXT,
  changed_at TIMESTAMPTZ,
  new_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verify user owns this policy
  IF NOT EXISTS (SELECT 1 FROM public.policies WHERE id = p_policy_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Policy not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    pv.version_number,
    pv.change_type,
    pv.change_summary,
    pv.changed_at,
    pv.new_data
  FROM public.policy_versions pv
  WHERE pv.policy_id = p_policy_id
  ORDER BY pv.version_number DESC;
END;
$$;

-- Fix create_policy_version function
CREATE OR REPLACE FUNCTION public.create_policy_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM public.policy_versions
  WHERE policy_id = NEW.id;

  -- Create version record
  INSERT INTO public.policy_versions (
    policy_id,
    version_number,
    change_type,
    change_summary,
    previous_data,
    new_data,
    changed_by
  ) VALUES (
    NEW.id,
    next_version,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'created'
      ELSE 'updated'
    END,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Policy created'
      ELSE 'Policy updated'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    auth.uid()
  );

  -- Update the updated_at timestamp
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

-- =============================================================================
-- FIX SUPABASE INTERNAL FUNCTIONS (if they exist in your project)
-- =============================================================================

-- Fix handle_new_user if it exists (common Supabase auth trigger)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
    -- Check if the function exists and update it
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $inner$
      BEGIN
        -- Insert profile or other user setup logic here
        RETURN NEW;
      END;
      $inner$;
    $func$;
  END IF;
END;
$$;

-- Fix update_updated_at if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.update_updated_at()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = ''
      AS $inner$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $inner$;
    $func$;
  END IF;
END;
$$;

-- Fix update_policy_status if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_policy_status') THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.update_policy_status()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = ''
      AS $inner$
      BEGIN
        -- Update status based on expiry date
        IF NEW.expiry_date < CURRENT_DATE THEN
          NEW.status = 'expired';
        ELSIF NEW.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN
          NEW.status = 'expiring';
        ELSE
          NEW.status = 'active';
        END IF;
        RETURN NEW;
      END;
      $inner$;
    $func$;
  END IF;
END;
$$;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- List all functions with mutable search_path (should be empty after running this)
-- SELECT n.nspname as schema, p.proname as function
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
-- AND p.proconfig IS NULL OR NOT ('search_path=' = ANY(p.proconfig));
