-- Migration: Settings Webhooks
-- Purpose: Webhook subscriptions and delivery log for settings change events
-- Created: 2026-02-06

-- ============================================================================
-- SETTINGS WEBHOOKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.settings_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Webhook identity
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,

  -- Event filtering
  events JSONB NOT NULL DEFAULT '["setting.updated"]'::jsonb,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,  -- empty = all categories

  -- State
  enabled BOOLEAN NOT NULL DEFAULT true,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WEBHOOK DELIVERIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to webhook
  webhook_id UUID NOT NULL REFERENCES public.settings_webhooks(id) ON DELETE CASCADE,

  -- Delivery details
  event TEXT NOT NULL,
  payload JSONB NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  status_code INTEGER,
  response_body TEXT,
  error_message TEXT,

  -- Retry tracking
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- For listing enabled webhooks by event
CREATE INDEX IF NOT EXISTS idx_settings_webhooks_enabled
  ON public.settings_webhooks(enabled);

-- For querying deliveries by webhook
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id
  ON public.webhook_deliveries(webhook_id);

-- For querying deliveries by status (for retry processing)
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON public.webhook_deliveries(status);

-- For ordering deliveries by date
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at
  ON public.webhook_deliveries(created_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_settings_webhooks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settings_webhooks_updated_at
  BEFORE UPDATE ON public.settings_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_webhooks_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.settings_webhooks IS
  'Webhook subscriptions for settings change notifications';

COMMENT ON TABLE public.webhook_deliveries IS
  'Delivery log for webhook payloads with retry tracking';

COMMENT ON COLUMN public.settings_webhooks.events IS
  'JSON array of subscribed events: setting.updated, setting.batch_updated, setting.imported, feature_flag.toggled';

COMMENT ON COLUMN public.settings_webhooks.categories IS
  'JSON array of setting categories to filter on. Empty array means all categories';

COMMENT ON COLUMN public.settings_webhooks.secret IS
  'HMAC-SHA256 secret for payload signature verification (X-Webhook-Signature header)';
