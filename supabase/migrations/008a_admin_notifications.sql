-- Migration: Admin Notifications
-- Purpose: Store admin notifications for API errors, billing issues, rate limits, etc.
-- Created: 2026-01-24

-- ============================================================================
-- ADMIN NOTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Notification details
  type TEXT NOT NULL CHECK (type IN ('error', 'warning', 'info')),
  category TEXT NOT NULL CHECK (category IN ('billing', 'api_error', 'rate_limit', 'system', 'security')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Provider context (for API-related notifications)
  provider TEXT, -- 'anthropic', 'openai', 'google', etc.

  -- Additional details as JSON
  details JSONB,

  -- Acknowledgement tracking
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- For querying unacknowledged notifications
CREATE INDEX IF NOT EXISTS idx_admin_notifications_acknowledged
  ON public.admin_notifications(acknowledged);

-- For filtering by category
CREATE INDEX IF NOT EXISTS idx_admin_notifications_category
  ON public.admin_notifications(category);

-- For ordering by date
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON public.admin_notifications(created_at DESC);

-- For filtering by provider
CREATE INDEX IF NOT EXISTS idx_admin_notifications_provider
  ON public.admin_notifications(provider);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.admin_notifications IS
  'Stores admin notifications for API errors, billing issues, rate limits, and system events';

COMMENT ON COLUMN public.admin_notifications.type IS
  'Notification severity: error, warning, info';

COMMENT ON COLUMN public.admin_notifications.category IS
  'Category: billing, api_error, rate_limit, system, security';

COMMENT ON COLUMN public.admin_notifications.details IS
  'Additional details as JSON (error codes, retry-after headers, etc.)';
