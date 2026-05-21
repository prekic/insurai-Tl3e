/**
 * Alert Service
 *
 * Unified alerting bridge that dispatches critical extraction events through
 * all configured channels: admin notifications (Supabase), email (Resend),
 * and Telegram (when configured).
 *
 * This consolidates the ad-hoc logging/notification scattered across
 * extraction.ts and the alert service into a single dispatch point that
 * every fix path calls.
 */

import { logger } from './logger.js'
import { createNotification } from '../services/admin-notification-service.js'
import { sendAdminAlertEmail } from '../services/email-service.js'

const svcLog = logger.child('alert-service')

// ── Cooldown ───────────────────────────────────────────────────────────────
const lastAlertFired = new Map<string, number>()

function isOnCooldown(key: string, cooldownMs: number): boolean {
  const last = lastAlertFired.get(key)
  return last !== undefined && Date.now() - last < cooldownMs
}

function markAlertFired(key: string): void {
  if (lastAlertFired.size >= 100) {
    const oldest = [...lastAlertFired.entries()].sort(([, a], [, b]) => a - b)[0]?.[0]
    if (oldest) lastAlertFired.delete(oldest)
  }
  lastAlertFired.set(key, Date.now())
}

// ── Config (read from env; see app_settings for the dashboard-equivalent) ──
function getAlertConfig() {
  return {
    enableEmailAlerts: process.env.ENABLE_EMAIL_ALERTS !== 'false',
    alertEmailAddresses: process.env.ALERT_EMAIL_ADDRESSES || '',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_ALERT_CHAT_ID || '',
    cooldownMs: Number(process.env.ALERT_COOLDOWN_MS) || 300_000, // 5 min default
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────
async function sendTelegramAlert(text: string): Promise<void> {
  const cfg = getAlertConfig()
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return

  try {
    await fetch(
      `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.telegramChatId,
          text,
          parse_mode: 'Markdown',
          disable_notification: false,
        }),
      }
    )
  } catch (err) {
    svcLog.warn('Telegram alert send failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ── Email ─────────────────────────────────────────────────────────────────
async function sendAlertEmail(
  type: 'error' | 'warning' | 'info',
  title: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  const cfg = getAlertConfig()
  if (!cfg.enableEmailAlerts) return

  const addresses = cfg.alertEmailAddresses
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  if (addresses.length === 0) return

  for (const email of addresses) {
    sendAdminAlertEmail(email, { type, title, message, details }).catch((err) =>
      svcLog.warn('Alert email failed', {
        email,
        error: err instanceof Error ? err.message : String(err),
      })
    )
  }
}

// ── Unified dispatch ──────────────────────────────────────────────────────

export type AlertSeverity = 'error' | 'warning' | 'info'
export type AlertCategory = 'billing' | 'api_error' | 'rate_limit' | 'performance' | 'system'

interface AlertPayload {
  severity: AlertSeverity
  category: AlertCategory
  title: string
  message: string
  provider?: string
  details?: Record<string, unknown>
  /** Distinct key for cooldown dedup — defaults to `${category}:${title}` */
  dedupKey?: string
}

/**
 * Send an alert through ALL enabled channels.
 * Respects per-key cooldown (configurable via ALERT_COOLDOWN_MS env var or
 * cooldownMs override).
 */
export async function dispatchAlert(
  payload: AlertPayload,
  cooldownMs?: number
): Promise<void> {
  const cfg = getAlertConfig()
  const cd = cooldownMs ?? cfg.cooldownMs
  const key = payload.dedupKey ?? `${payload.category}:${payload.title}`

  if (isOnCooldown(key, cd)) return
  markAlertFired(key)

  const { severity, category, title, message, provider, details } = payload

  // 1. Admin notification (Supabase)
  await createNotification({
    type: severity,
    category,
    title,
    message,
    provider,
    details,
  }).catch((err) =>
    svcLog.warn('Admin notification create failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    })
  )

  // 2. Email (Resend)
  await sendAlertEmail(severity, title, message, details)

  // 3. Telegram
  const telegramText =
    `*${severity === 'error' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️'} ${title}*\n` +
    `${message}\n` +
    (provider ? `Provider: \`${provider}\`\n` : '') +
    `Time: ${new Date().toISOString()}`

  await sendTelegramAlert(telegramText)

  svcLog.warn('Alert dispatched', { key, severity, category })
}

// ── Convenience wrappers ──────────────────────────────────────────────────

export function alertBilling(
  provider: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  return dispatchAlert({
    severity: 'error',
    category: 'billing',
    title: `${provider.toUpperCase()} Billing Issue / Quota Exhausted`,
    message,
    provider,
    details,
    dedupKey: `billing:${provider}`,
  })
}

export function alertProviderFallback(
  provider: string,
  reason: string,
  requestId: string,
  details?: Record<string, unknown>
): Promise<void> {
  const isBilling = reason.includes('BILLING') || reason.includes('quota')
  return dispatchAlert(
    {
      severity: isBilling ? 'error' : 'warning',
      category: isBilling ? 'billing' : 'api_error',
      title: `${provider.toUpperCase()} Unreachable — Fallback Active`,
      message: `${provider} failed with ${reason}. Falling back to next provider.`,
      provider,
      details: { requestId, ...details },
      dedupKey: `fallback:${provider}:${isBilling ? 'billing' : 'transient'}`,
    },
    isBilling ? 60_000 : 300_000 // billing alerts have shorter cooldown
  )
}

export function alertAllProvidersFailed(
  reason: string,
  requestId: string,
  providerChain: string,
  details?: Record<string, unknown>
): Promise<void> {
  return dispatchAlert({
    severity: 'error',
    category: 'system',
    title: '🚨 ALL AI Providers Failed',
    message: `All AI providers exhausted. Last error: ${reason}. Chain: ${providerChain}. Returning 503.`,
    details: { requestId, providerChain, ...details },
    dedupKey: `all_providers_failed:${providerChain}`,
  })
}
