/**
 * Input sanitization utilities for security hardening
 * Prevents XSS attacks and other injection vulnerabilities
 */

// HTML entities to escape
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
}

/**
 * Escapes HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return ''
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char)
}

/**
 * Sanitizes user input by:
 * - Trimming whitespace
 * - Removing null bytes
 * - Limiting length
 * - Optionally escaping HTML
 */
export function sanitizeInput(
  input: string,
  options: {
    maxLength?: number
    escapeHtml?: boolean
    trim?: boolean
    allowNewlines?: boolean
  } = {}
): string {
  const { maxLength = 1000, escapeHtml: shouldEscape = false, trim = true, allowNewlines = false } = options

  if (typeof input !== 'string') return ''

  let sanitized = input

  // Remove null bytes (can cause issues in some contexts)
  sanitized = sanitized.replace(/\0/g, '')

  // Remove control characters except newlines/tabs if allowed
  // eslint-disable-next-line no-control-regex
  const controlCharsWithNewlines = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
  // eslint-disable-next-line no-control-regex
  const controlCharsAll = /[\x00-\x1F\x7F]/g

  if (allowNewlines) {
    sanitized = sanitized.replace(controlCharsWithNewlines, '')
  } else {
    sanitized = sanitized.replace(controlCharsAll, ' ')
  }

  // Trim whitespace
  if (trim) {
    sanitized = sanitized.trim()
  }

  // Limit length
  if (maxLength > 0 && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength)
  }

  // Escape HTML if requested
  if (shouldEscape) {
    sanitized = escapeHtml(sanitized)
  }

  return sanitized
}

/**
 * Sanitizes a search query for safe use in filtering
 */
export function sanitizeSearchQuery(query: string): string {
  return sanitizeInput(query, {
    maxLength: 200,
    trim: true,
    allowNewlines: false,
  })
}

/**
 * Sanitizes a file name to prevent path traversal and other attacks
 */
export function sanitizeFileName(fileName: string): string {
  if (typeof fileName !== 'string') return 'unnamed'

  let sanitized = fileName

  // Remove path separators (prevent path traversal)
  sanitized = sanitized.replace(/[/\\]/g, '_')

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '')

  // Remove or replace dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_')

  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '')

  // Collapse multiple underscores/spaces
  sanitized = sanitized.replace(/[_\s]+/g, '_')

  // Limit length (preserve extension)
  const maxLength = 255
  if (sanitized.length > maxLength) {
    const ext = sanitized.slice(sanitized.lastIndexOf('.'))
    const name = sanitized.slice(0, sanitized.lastIndexOf('.'))
    const maxNameLength = maxLength - ext.length
    sanitized = name.slice(0, maxNameLength) + ext
  }

  // Fallback if empty
  if (!sanitized || sanitized === '_') {
    return 'unnamed_file'
  }

  return sanitized
}

/**
 * Sanitizes chat/message content
 */
export function sanitizeMessage(message: string): string {
  return sanitizeInput(message, {
    maxLength: 10000,
    trim: true,
    allowNewlines: true,
  })
}

/**
 * Validates and sanitizes an email address
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') return ''

  const sanitized = email.trim().toLowerCase()

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(sanitized)) {
    return ''
  }

  // Max length check
  if (sanitized.length > 254) {
    return ''
  }

  return sanitized
}

/**
 * Sanitizes a URL to prevent javascript: and data: attacks
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return ''

  const sanitized = url.trim()

  // Block dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:']
  const lowerUrl = sanitized.toLowerCase()

  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      return ''
    }
  }

  // Only allow http, https, mailto, tel
  const allowedProtocols = ['http://', 'https://', 'mailto:', 'tel:', '/']
  const hasAllowedProtocol = allowedProtocols.some(
    (p) => lowerUrl.startsWith(p) || !lowerUrl.includes(':')
  )

  if (!hasAllowedProtocol) {
    return ''
  }

  return sanitized
}

/**
 * Sanitizes numeric input
 */
export function sanitizeNumber(
  value: string | number,
  options: { min?: number; max?: number; defaultValue?: number } = {}
): number {
  const { min = -Infinity, max = Infinity, defaultValue = 0 } = options

  const num = typeof value === 'number' ? value : parseFloat(value)

  if (isNaN(num) || !isFinite(num)) {
    return defaultValue
  }

  return Math.min(Math.max(num, min), max)
}

/**
 * Sanitizes an ID string (alphanumeric + hyphens/underscores only)
 */
export function sanitizeId(id: string): string {
  if (typeof id !== 'string') return ''
  return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)
}

/**
 * Creates a safe string for use in RegExp
 */
export function escapeRegExp(str: string): string {
  if (typeof str !== 'string') return ''
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
