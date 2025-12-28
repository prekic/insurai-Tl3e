import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  sanitizeInput,
  sanitizeSearchQuery,
  sanitizeFileName,
  sanitizeMessage,
  sanitizeEmail,
  sanitizeUrl,
  sanitizeNumber,
  sanitizeId,
  escapeRegExp,
} from './sanitize'

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    )
  })

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('returns empty for non-string input', () => {
    expect(escapeHtml(null as unknown as string)).toBe('')
    expect(escapeHtml(undefined as unknown as string)).toBe('')
  })

  it('escapes ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar')
  })
})

describe('sanitizeInput', () => {
  it('trims whitespace by default', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello')
  })

  it('removes null bytes', () => {
    expect(sanitizeInput('hello\0world')).toBe('helloworld')
  })

  it('limits length', () => {
    expect(sanitizeInput('hello world', { maxLength: 5 })).toBe('hello')
  })

  it('escapes HTML when requested', () => {
    expect(sanitizeInput('<script>', { escapeHtml: true })).toBe('&lt;script&gt;')
  })

  it('handles newlines based on option', () => {
    expect(sanitizeInput('hello\nworld', { allowNewlines: true })).toBe('hello\nworld')
    expect(sanitizeInput('hello\nworld', { allowNewlines: false })).toBe('hello world')
  })

  it('returns empty for non-string input', () => {
    expect(sanitizeInput(123 as unknown as string)).toBe('')
  })
})

describe('sanitizeSearchQuery', () => {
  it('sanitizes search queries', () => {
    expect(sanitizeSearchQuery('  hello world  ')).toBe('hello world')
  })

  it('limits query length', () => {
    const longQuery = 'a'.repeat(300)
    expect(sanitizeSearchQuery(longQuery).length).toBe(200)
  })
})

describe('sanitizeFileName', () => {
  it('removes path separators', () => {
    expect(sanitizeFileName('file/path')).toBe('file_path')
    expect(sanitizeFileName('file\\path')).toBe('file_path')
  })

  it('handles path traversal attempts', () => {
    // Path traversal is neutralized by replacing separators with underscores
    const result = sanitizeFileName('../../../etc/passwd')
    expect(result).not.toContain('/')
    expect(result).not.toContain('\\')
    // The result should be safe - no path traversal possible
    expect(result).toBe('_.._.._etc_passwd')
  })

  it('removes dangerous characters', () => {
    expect(sanitizeFileName('file<>:"|?*.txt')).toBe('file_.txt')
  })

  it('handles empty or invalid names', () => {
    expect(sanitizeFileName('')).toBe('unnamed_file')
    expect(sanitizeFileName('...')).toBe('unnamed_file')
  })

  it('preserves valid file names', () => {
    expect(sanitizeFileName('document.pdf')).toBe('document.pdf')
  })

  it('removes leading/trailing dots', () => {
    expect(sanitizeFileName('.hidden.txt.')).toBe('hidden.txt')
  })
})

describe('sanitizeMessage', () => {
  it('allows newlines in messages', () => {
    expect(sanitizeMessage('hello\nworld')).toBe('hello\nworld')
  })

  it('limits message length', () => {
    const longMessage = 'a'.repeat(15000)
    expect(sanitizeMessage(longMessage).length).toBe(10000)
  })
})

describe('sanitizeEmail', () => {
  it('validates and sanitizes email', () => {
    expect(sanitizeEmail('  USER@EXAMPLE.COM  ')).toBe('user@example.com')
  })

  it('returns empty for invalid email', () => {
    expect(sanitizeEmail('not-an-email')).toBe('')
    expect(sanitizeEmail('@example.com')).toBe('')
  })

  it('returns empty for too long email', () => {
    const longEmail = 'a'.repeat(250) + '@example.com'
    expect(sanitizeEmail(longEmail)).toBe('')
  })
})

describe('sanitizeUrl', () => {
  it('allows safe URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com')
    expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page')
  })

  it('blocks javascript: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('')
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('')
  })

  it('blocks data: URLs', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('')
  })

  it('blocks file: URLs', () => {
    expect(sanitizeUrl('file:///etc/passwd')).toBe('')
  })
})

describe('sanitizeNumber', () => {
  it('parses valid numbers', () => {
    expect(sanitizeNumber('42')).toBe(42)
    expect(sanitizeNumber(3.14)).toBe(3.14)
  })

  it('returns default for invalid numbers', () => {
    expect(sanitizeNumber('not a number')).toBe(0)
    expect(sanitizeNumber('not a number', { defaultValue: 10 })).toBe(10)
  })

  it('clamps to min/max', () => {
    expect(sanitizeNumber(100, { max: 50 })).toBe(50)
    expect(sanitizeNumber(-10, { min: 0 })).toBe(0)
  })
})

describe('sanitizeId', () => {
  it('removes non-alphanumeric characters', () => {
    expect(sanitizeId('user-123_abc')).toBe('user-123_abc')
    expect(sanitizeId('user@123!abc')).toBe('user123abc')
  })

  it('limits length', () => {
    const longId = 'a'.repeat(150)
    expect(sanitizeId(longId).length).toBe(100)
  })
})

describe('escapeRegExp', () => {
  it('escapes regex special characters', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\'))
      .toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\')
  })

  it('preserves normal strings', () => {
    expect(escapeRegExp('hello world')).toBe('hello world')
  })
})
