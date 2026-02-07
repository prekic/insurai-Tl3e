/**
 * Email Service
 *
 * Handles all transactional email sending using Resend.
 * Supports welcome emails, policy alerts, and admin notifications.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { logger } from '../lib/logger.js'

const log = logger.child('EmailService')

// Email provider configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_API_URL = 'https://api.resend.com/emails'
const FROM_EMAIL = process.env.EMAIL_FROM || 'InsurAI <noreply@insurai.app>'
const REPLY_TO_EMAIL = process.env.EMAIL_REPLY_TO || 'support@insurai.app'

// App URLs
const APP_URL = process.env.FRONTEND_URL || 'https://insurai-production.up.railway.app'

export type EmailType =
  | 'welcome'
  | 'password_reset'
  | 'policy_uploaded'
  | 'policy_expiring'
  | 'policy_expired'
  | 'trial_reminder'
  | 'trial_expired'
  | 'admin_alert'

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  tags?: { name: string; value: string }[]
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// Supabase client for logging and preferences
let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  supabase = createClient(url, key)
  return supabase
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY
}

/**
 * Send an email using Resend
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    log.warn('Resend API key not configured, skipping email')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || stripHtml(options.html),
        reply_to: options.replyTo || REPLY_TO_EMAIL,
        tags: options.tags,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      log.error('Resend API error', { status: response.status, error: JSON.stringify(errorData) })
      return {
        success: false,
        error: `Email send failed: ${response.status}`
      }
    }

    const data = await response.json() as { id: string }
    log.info('Email sent successfully', { messageId: data.id })

    // Log email to database
    await logEmailSent(options.to, options.subject, data.id)

    return { success: true, messageId: data.id }
  } catch (error) {
    log.error('Failed to send email', { error: String(error) })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Log email to database for tracking
 */
async function logEmailSent(to: string, subject: string, messageId: string): Promise<void> {
  const client = getSupabase()
  if (!client) return

  try {
    await client.from('email_logs').insert({
      recipient: to,
      subject,
      message_id: messageId,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
  } catch (error) {
    log.warn('Failed to log email', { error: String(error) })
  }
}

/**
 * Strip HTML tags for plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generate an unsubscribe token for an email address
 * Uses HMAC-SHA256 with a secret key
 */
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_JWT_SECRET || 'default-unsubscribe-secret'

function generateUnsubscribeToken(email: string): string {
  const normalizedEmail = email.toLowerCase().trim()
  return crypto
    .createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(normalizedEmail)
    .digest('hex')
    .substring(0, 32)
}

/**
 * Generate an unsubscribe URL for an email address
 */
function getUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email)
  return `${APP_URL}/unsubscribe?email=${encodeURIComponent(email.toLowerCase().trim())}&token=${token}`
}

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
  .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
  .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 32px; text-align: center; }
  .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
  .header p { color: #bfdbfe; margin: 8px 0 0 0; font-size: 14px; }
  .content { padding: 32px; }
  .content h2 { color: #1f2937; font-size: 20px; margin: 0 0 16px 0; }
  .content p { margin: 0 0 16px 0; color: #4b5563; }
  .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
  .button:hover { background-color: #1d4ed8; }
  .card { background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .card-title { font-weight: 600; color: #1f2937; margin: 0 0 8px 0; }
  .card-value { font-size: 24px; font-weight: 700; color: #2563eb; margin: 0; }
  .alert { padding: 12px 16px; border-radius: 8px; margin: 16px 0; }
  .alert-warning { background-color: #fef3c7; border: 1px solid #f59e0b; color: #92400e; }
  .alert-danger { background-color: #fee2e2; border: 1px solid #ef4444; color: #991b1b; }
  .alert-success { background-color: #d1fae5; border: 1px solid #10b981; color: #065f46; }
  .footer { background-color: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb; }
  .footer p { margin: 0; font-size: 12px; color: #6b7280; }
  .footer a { color: #2563eb; text-decoration: none; }
  .divider { height: 1px; background-color: #e5e7eb; margin: 24px 0; }
`

function wrapTemplate(content: string, recipientEmail?: string): string {
  const unsubscribeLink = recipientEmail
    ? `<a href="${getUnsubscribeUrl(recipientEmail)}">Abonelikten Çık</a> ·`
    : ''

  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>InsurAI</h1>
      <p>AI Sigorta Analiz Platformu</p>
    </div>
    ${content}
    <div class="footer">
      <p>© ${new Date().getFullYear()} InsurAI. Tüm hakları saklıdır.</p>
      <p style="margin-top: 8px;">
        <a href="${APP_URL}/help">Yardım</a> ·
        <a href="${APP_URL}/settings">Email Tercihler</a> ·
        ${unsubscribeLink}
        <a href="${APP_URL}">Ana Sayfa</a>
      </p>
    </div>
  </div>
</body>
</html>
`
}

// =============================================================================
// EMAIL FUNCTIONS
// =============================================================================

/**
 * Send welcome email to new users
 */
export async function sendWelcomeEmail(
  email: string,
  name?: string
): Promise<EmailResult> {
  const displayName = name || 'Değerli Kullanıcı'

  const content = `
    <div class="content">
      <h2>Hoş Geldiniz, ${displayName}! 🎉</h2>
      <p>InsurAI'a kayıt olduğunuz için teşekkür ederiz. Artık sigorta poliçelerinizi yapay zeka ile analiz edebilirsiniz.</p>

      <div class="card">
        <p class="card-title">InsurAI ile neler yapabilirsiniz?</p>
        <ul style="margin: 8px 0; padding-left: 20px; color: #4b5563;">
          <li>PDF poliçelerinizi yükleyin ve anında analiz edin</li>
          <li>Eksik teminatları ve güvenlik açıklarını tespit edin</li>
          <li>Piyasa karşılaştırması yapın</li>
          <li>Poliçelerinizi karşılaştırın</li>
          <li>AI asistanınızla sohbet edin</li>
        </ul>
      </div>

      <p style="text-align: center;">
        <a href="${APP_URL}/upload" class="button">İlk Poliçenizi Yükleyin →</a>
      </p>

      <div class="divider"></div>

      <p style="font-size: 14px; color: #6b7280;">
        Herhangi bir sorunuz varsa, <a href="${APP_URL}/help" style="color: #2563eb;">Yardım Merkezi</a>'ni ziyaret edebilir veya bu emaile yanıt verebilirsiniz.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject: 'InsurAI\'a Hoş Geldiniz! 🎉',
    html: wrapTemplate(content, email),
    tags: [{ name: 'type', value: 'welcome' }],
  })
}

/**
 * Send policy upload confirmation
 */
export async function sendPolicyUploadedEmail(
  email: string,
  policyData: {
    policyNumber: string
    provider: string
    type: string
    typeTr: string
    score?: number
    grade?: string
    expiryDate?: string
  }
): Promise<EmailResult> {
  const scoreColor = (policyData.score || 0) >= 70 ? '#10b981' :
                     (policyData.score || 0) >= 50 ? '#f59e0b' : '#ef4444'

  const content = `
    <div class="content">
      <h2>Poliçeniz Başarıyla Analiz Edildi ✅</h2>
      <p>Yüklediğiniz sigorta poliçesi başarıyla işlendi ve analiz edildi.</p>

      <div class="card">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Poliçe No:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.policyNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Sigorta Şirketi:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.provider}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Poliçe Türü:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.typeTr}</td>
          </tr>
          ${policyData.expiryDate ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Bitiş Tarihi:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.expiryDate}</td>
          </tr>
          ` : ''}
          ${policyData.score !== undefined ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Analiz Puanı:</td>
            <td style="padding: 8px 0; font-weight: 700; text-align: right; font-size: 20px; color: ${scoreColor};">
              ${policyData.score}/100 ${policyData.grade ? `(${policyData.grade})` : ''}
            </td>
          </tr>
          ` : ''}
        </table>
      </div>

      <p style="text-align: center;">
        <a href="${APP_URL}/dashboard" class="button">Poliçenizi Görüntüleyin →</a>
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject: `Poliçe Analiz Tamamlandı: ${policyData.policyNumber}`,
    html: wrapTemplate(content, email),
    tags: [{ name: 'type', value: 'policy_uploaded' }],
  })
}

/**
 * Send policy expiration warning
 */
export async function sendPolicyExpiringEmail(
  email: string,
  policyData: {
    policyNumber: string
    provider: string
    typeTr: string
    expiryDate: string
    daysRemaining: number
  }
): Promise<EmailResult> {
  const urgencyClass = policyData.daysRemaining <= 7 ? 'alert-danger' : 'alert-warning'
  const urgencyText = policyData.daysRemaining <= 7 ? 'Acil' : 'Dikkat'

  const content = `
    <div class="content">
      <h2>⚠️ Poliçenizin Süresi Dolmak Üzere</h2>

      <div class="alert ${urgencyClass}">
        <strong>${urgencyText}:</strong> Poliçenizin bitiş tarihine ${policyData.daysRemaining} gün kaldı!
      </div>

      <div class="card">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Poliçe No:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.policyNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Sigorta Şirketi:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.provider}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Poliçe Türü:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.typeTr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Bitiş Tarihi:</td>
            <td style="padding: 8px 0; font-weight: 700; text-align: right; color: #ef4444;">${policyData.expiryDate}</td>
          </tr>
        </table>
      </div>

      <p>Sigortanızın kesintiye uğramaması için lütfen poliçenizi yenilemeyi unutmayın.</p>

      <p style="text-align: center;">
        <a href="${APP_URL}/dashboard" class="button">Poliçeyi Görüntüle →</a>
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject: `⚠️ Poliçe Süresi Doluyor: ${policyData.policyNumber} (${policyData.daysRemaining} gün)`,
    html: wrapTemplate(content, email),
    tags: [{ name: 'type', value: 'policy_expiring' }],
  })
}

/**
 * Send policy expired notification
 */
export async function sendPolicyExpiredEmail(
  email: string,
  policyData: {
    policyNumber: string
    provider: string
    typeTr: string
    expiryDate: string
  }
): Promise<EmailResult> {
  const content = `
    <div class="content">
      <h2>🚨 Poliçenizin Süresi Doldu</h2>

      <div class="alert alert-danger">
        <strong>Önemli:</strong> Bu poliçenin süresi dolmuştur. Sigortasız kalmamak için lütfen en kısa sürede yenileyiniz.
      </div>

      <div class="card">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Poliçe No:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.policyNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Sigorta Şirketi:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.provider}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Poliçe Türü:</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${policyData.typeTr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Bitiş Tarihi:</td>
            <td style="padding: 8px 0; font-weight: 700; text-align: right; color: #ef4444;">${policyData.expiryDate}</td>
          </tr>
        </table>
      </div>

      <p style="text-align: center;">
        <a href="${APP_URL}/dashboard" class="button">Panele Git →</a>
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject: `🚨 Poliçe Süresi Doldu: ${policyData.policyNumber}`,
    html: wrapTemplate(content, email),
    tags: [{ name: 'type', value: 'policy_expired' }],
  })
}

/**
 * Send trial reminder email
 */
export async function sendTrialReminderEmail(
  email: string,
  data: {
    analysisCount: number
    daysRemaining?: number
  }
): Promise<EmailResult> {
  const content = `
    <div class="content">
      <h2>InsurAI'ı Denediniz! 🎯</h2>
      <p>Ücretsiz denemenizi kullandınız. İşte sonuçlarınız:</p>

      <div class="card" style="text-align: center;">
        <p class="card-title">Analiz Edilen Poliçe</p>
        <p class="card-value">${data.analysisCount}</p>
      </div>

      <p>Tüm özelliklerden faydalanmak için hemen kayıt olun:</p>

      <ul style="margin: 16px 0; padding-left: 20px; color: #4b5563;">
        <li>Sınırsız poliçe analizi</li>
        <li>Poliçe karşılaştırma</li>
        <li>AI sohbet asistanı</li>
        <li>PDF dışa aktarma</li>
        <li>Tüm verilerinizi saklayın</li>
      </ul>

      <p style="text-align: center;">
        <a href="${APP_URL}/auth" class="button">Ücretsiz Kayıt Ol →</a>
      </p>

      <p style="font-size: 14px; color: #6b7280; text-align: center;">
        Kayıt tamamen ücretsizdir ve kredi kartı gerektirmez.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject: 'InsurAI Denemeniz - Tüm Özelliklere Erişin! 🚀',
    html: wrapTemplate(content, email),
    tags: [{ name: 'type', value: 'trial_reminder' }],
  })
}

/**
 * Send admin alert email
 */
export async function sendAdminAlertEmail(
  email: string,
  alert: {
    type: 'error' | 'warning' | 'info'
    title: string
    message: string
    details?: Record<string, unknown>
  }
): Promise<EmailResult> {
  const alertClass = alert.type === 'error' ? 'alert-danger' :
                     alert.type === 'warning' ? 'alert-warning' : 'alert-success'
  const emoji = alert.type === 'error' ? '🚨' :
                alert.type === 'warning' ? '⚠️' : 'ℹ️'

  const content = `
    <div class="content">
      <h2>${emoji} Admin Alert: ${alert.title}</h2>

      <div class="alert ${alertClass}">
        ${alert.message}
      </div>

      ${alert.details ? `
      <div class="card">
        <p class="card-title">Details</p>
        <pre style="font-size: 12px; overflow-x: auto; white-space: pre-wrap;">${JSON.stringify(alert.details, null, 2)}</pre>
      </div>
      ` : ''}

      <p style="text-align: center;">
        <a href="${APP_URL}/admin" class="button">Go to Admin Panel →</a>
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject: `[InsurAI Admin] ${emoji} ${alert.title}`,
    html: wrapTemplate(content, email),
    tags: [{ name: 'type', value: 'admin_alert' }],
  })
}

// =============================================================================
// EMAIL PREFERENCES
// =============================================================================

export interface EmailPreferences {
  marketing: boolean
  policy_alerts: boolean
  expiration_reminders: boolean
  weekly_digest: boolean
}

const DEFAULT_PREFERENCES: EmailPreferences = {
  marketing: true,
  policy_alerts: true,
  expiration_reminders: true,
  weekly_digest: false,
}

/**
 * Get user's email preferences
 */
export async function getEmailPreferences(userId: string): Promise<EmailPreferences> {
  const client = getSupabase()
  if (!client) return DEFAULT_PREFERENCES

  const { data } = await client
    .from('user_email_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!data) return DEFAULT_PREFERENCES

  return {
    marketing: data.marketing ?? DEFAULT_PREFERENCES.marketing,
    policy_alerts: data.policy_alerts ?? DEFAULT_PREFERENCES.policy_alerts,
    expiration_reminders: data.expiration_reminders ?? DEFAULT_PREFERENCES.expiration_reminders,
    weekly_digest: data.weekly_digest ?? DEFAULT_PREFERENCES.weekly_digest,
  }
}

/**
 * Update user's email preferences
 */
export async function updateEmailPreferences(
  userId: string,
  preferences: Partial<EmailPreferences>
): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false

  const { error } = await client
    .from('user_email_preferences')
    .upsert({
      user_id: userId,
      ...preferences,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    log.error('Failed to update preferences', { error: String(error) })
    return false
  }

  return true
}

/**
 * Check if user has opted in for a specific email type
 */
export async function canSendEmail(
  userId: string,
  emailType: EmailType
): Promise<boolean> {
  const prefs = await getEmailPreferences(userId)

  switch (emailType) {
    case 'welcome':
    case 'password_reset':
    case 'admin_alert':
      return true // Always send transactional emails
    case 'policy_uploaded':
    case 'policy_expiring':
    case 'policy_expired':
      return prefs.policy_alerts
    case 'trial_reminder':
    case 'trial_expired':
      return prefs.marketing
    default:
      return true
  }
}
