-- Migration 047: Add 'performance' to admin_notifications.category CHECK constraint
--
-- Schema drift surfaced by structured logging (PR #393):
-- pgCode 23514 — "new row for relation \"admin_notifications\" violates check
-- constraint \"admin_notifications_category_check\"". Failing row had
-- category = 'performance'.
--
-- The TypeScript type `NotificationCategory` in admin-notification-service.ts
-- was extended with 'performance' to support extraction-perf alerts (response
-- time, error rate) emitted by extraction-alert-service.ts and the config
-- performance monitor. The SQL CHECK was never updated, so every perf alert
-- write failed silently as `[object Object]` until #393 made the error visible.
--
-- DROP + ADD is required because PostgreSQL does not support modifying CHECK
-- constraints in place. The new constraint is a strict superset of the old.

ALTER TABLE public.admin_notifications
  DROP CONSTRAINT IF EXISTS admin_notifications_category_check;

ALTER TABLE public.admin_notifications
  ADD CONSTRAINT admin_notifications_category_check
    CHECK (category IN (
      'billing',
      'api_error',
      'rate_limit',
      'system',
      'security',
      'performance'
    ));
