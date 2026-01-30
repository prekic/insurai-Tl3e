-- Migration: Email System
-- Created: 2026-01-30
-- Description: Add tables for email preferences, logs, and captured emails

-- =============================================================================
-- EMAIL PREFERENCES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_email_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    marketing BOOLEAN DEFAULT true,
    policy_alerts BOOLEAN DEFAULT true,
    expiration_reminders BOOLEAN DEFAULT true,
    weekly_digest BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_preferences_user_id ON public.user_email_preferences(user_id);

-- RLS policies
ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email preferences"
    ON public.user_email_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own email preferences"
    ON public.user_email_preferences FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email preferences"
    ON public.user_email_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Service role bypass for server-side operations
CREATE POLICY "Service role can manage all preferences"
    ON public.user_email_preferences FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- EMAIL LOGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    message_id VARCHAR(255),
    email_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked')),
    metadata JSONB DEFAULT '{}',
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for email logs
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(recipient);
CREATE INDEX IF NOT EXISTS idx_email_logs_message_id ON public.email_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON public.email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);

-- RLS - only service role can access email logs
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage email logs"
    ON public.email_logs FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- CAPTURED EMAILS TABLE (for trial users who haven't signed up)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.captured_emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    source VARCHAR(50) DEFAULT 'trial' CHECK (source IN ('trial', 'landing', 'exit_intent', 'newsletter', 'other')),
    converted BOOLEAN DEFAULT false,
    converted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_captured_emails_email ON public.captured_emails(email);
CREATE INDEX IF NOT EXISTS idx_captured_emails_source ON public.captured_emails(source);
CREATE INDEX IF NOT EXISTS idx_captured_emails_converted ON public.captured_emails(converted);
CREATE INDEX IF NOT EXISTS idx_captured_emails_created_at ON public.captured_emails(created_at DESC);

-- RLS - only service role can access captured emails
ALTER TABLE public.captured_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage captured emails"
    ON public.captured_emails FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SCHEDULED EMAIL JOBS TABLE (for expiration reminders, etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email_type VARCHAR(50) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    payload JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for scheduled emails
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON public.scheduled_emails(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_for ON public.scheduled_emails(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user_id ON public.scheduled_emails(user_id);

-- Composite index for job processing
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_pending
    ON public.scheduled_emails(scheduled_for)
    WHERE status = 'pending';

-- RLS - only service role can access scheduled emails
ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage scheduled emails"
    ON public.scheduled_emails FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- FUNCTION: Create default email preferences for new users
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_email_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_email_preferences (user_id, marketing, policy_alerts, expiration_reminders, weekly_digest)
    VALUES (NEW.id, true, true, true, false)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create email preferences when user is created
DROP TRIGGER IF EXISTS on_auth_user_created_email_preferences ON auth.users;
CREATE TRIGGER on_auth_user_created_email_preferences
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_email_preferences();

-- =============================================================================
-- FUNCTION: Check and mark captured email as converted
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_captured_email_converted()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.captured_emails
    SET
        converted = true,
        converted_user_id = NEW.id,
        updated_at = NOW()
    WHERE email = NEW.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to mark captured emails as converted when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created_mark_converted ON auth.users;
CREATE TRIGGER on_auth_user_created_mark_converted
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.mark_captured_email_converted();

-- =============================================================================
-- FUNCTION: Get policies expiring soon (for scheduled email jobs)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_expiring_policies(days_ahead INTEGER DEFAULT 30)
RETURNS TABLE (
    user_id UUID,
    user_email TEXT,
    policy_id UUID,
    policy_number TEXT,
    provider TEXT,
    type_tr TEXT,
    expiry_date DATE,
    days_remaining INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.user_id,
        u.email::TEXT as user_email,
        p.id as policy_id,
        p.policy_number,
        p.provider,
        p.type_tr,
        p.expiry_date,
        (p.expiry_date - CURRENT_DATE)::INTEGER as days_remaining
    FROM public.policies p
    JOIN auth.users u ON p.user_id = u.id
    JOIN public.user_email_preferences ep ON p.user_id = ep.user_id
    WHERE
        p.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + days_ahead
        AND p.status != 'expired'
        AND ep.expiration_reminders = true
    ORDER BY p.expiry_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.user_email_preferences IS 'User preferences for email notifications';
COMMENT ON TABLE public.email_logs IS 'Log of all sent emails for tracking and debugging';
COMMENT ON TABLE public.captured_emails IS 'Emails captured from trial users before signup';
COMMENT ON TABLE public.scheduled_emails IS 'Queue for scheduled email jobs (expiration reminders, etc.)';
COMMENT ON FUNCTION public.get_expiring_policies IS 'Returns policies expiring within N days for users who have opted in to reminders';
