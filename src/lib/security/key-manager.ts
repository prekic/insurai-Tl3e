/**
 * Secure API Key Manager
 * Encrypts and securely stores API keys in the browser
 * For production, use the backend proxy instead
 */

import { auditLogger } from './audit-logger'

/**
 * Key storage configuration
 */
const STORAGE_PREFIX = 'insurai_secure_'
const ENCRYPTION_SALT = 'insurai_key_salt_v1'

/**
 * Supported API key providers
 */
export type APIKeyProvider = 'openai' | 'anthropic' | 'google'

/**
 * Key validation patterns
 */
const KEY_PATTERNS: Record<APIKeyProvider, RegExp> = {
  openai: /^sk-[a-zA-Z0-9]{32,}$/,
  anthropic: /^sk-ant-[a-zA-Z0-9-]{32,}$/,
  google: /^AIza[a-zA-Z0-9-_]{32,}$/,
}

/**
 * Key format descriptions for error messages
 */
const KEY_FORMAT_HINTS: Record<APIKeyProvider, string> = {
  openai: 'OpenAI keys start with "sk-" followed by alphanumeric characters',
  anthropic: 'Anthropic keys start with "sk-ant-" followed by alphanumeric characters',
  google: 'Google Cloud keys start with "AIza" followed by alphanumeric characters',
}

/**
 * Encryption key derivation
 * Uses PBKDF2 to derive a key from a passphrase
 */
async function deriveEncryptionKey(): Promise<CryptoKey> {
  // Use a combination of factors for the passphrase
  const passphrase = [
    ENCRYPTION_SALT,
    typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) : 'default',
    typeof location !== 'undefined' ? location.origin : 'insurai',
  ].join('|')

  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(ENCRYPTION_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt a string value
 */
async function encryptValue(value: string): Promise<string> {
  const key = await deriveEncryptionKey()
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(value)
  )

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  // Convert to base64 for storage
  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypt a string value
 */
async function decryptValue(encryptedValue: string): Promise<string | null> {
  try {
    const key = await deriveEncryptionKey()
    const combined = Uint8Array.from(atob(encryptedValue), c => c.charCodeAt(0))

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}

/**
 * Validate API key format
 */
export function validateKeyFormat(provider: APIKeyProvider, key: string): {
  valid: boolean
  error?: string
} {
  // Check for placeholder values
  if (key === 'sk-...' || key === 'sk-ant-...' || key === 'AIza...') {
    return { valid: false, error: 'Please enter a real API key, not a placeholder' }
  }

  // Check minimum length
  if (key.length < 20) {
    return { valid: false, error: 'API key is too short' }
  }

  // Check maximum length
  if (key.length > 200) {
    return { valid: false, error: 'API key is too long' }
  }

  // Check format pattern
  const pattern = KEY_PATTERNS[provider]
  if (!pattern.test(key)) {
    return { valid: false, error: KEY_FORMAT_HINTS[provider] }
  }

  return { valid: true }
}

/**
 * Mask API key for display
 */
export function maskApiKey(key: string | null): string {
  if (!key) return '(not set)'
  if (key.length < 12) return '****'
  return key.slice(0, 8) + '...' + key.slice(-4)
}

/**
 * Secure Key Manager class
 */
class SecureKeyManager {
  private keyCache: Map<APIKeyProvider, string | null> = new Map()
  private initialized = false

  /**
   * Initialize the key manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Check if Web Crypto is available
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      console.warn('Web Crypto API not available. Key encryption disabled.')
    }

    this.initialized = true
  }

  /**
   * Check if encryption is supported
   */
  isEncryptionSupported(): boolean {
    return typeof crypto !== 'undefined' && !!crypto.subtle
  }

  /**
   * Store an API key securely
   */
  async setKey(provider: APIKeyProvider, key: string): Promise<{
    success: boolean
    error?: string
  }> {
    // Validate key format
    const validation = validateKeyFormat(provider, key)
    if (!validation.valid) {
      await auditLogger.logSecurity('security.key_validation_failed', {
        provider,
        reason: validation.error,
      })
      return { success: false, error: validation.error }
    }

    try {
      let valueToStore: string

      if (this.isEncryptionSupported()) {
        // Encrypt the key
        valueToStore = await encryptValue(key)
      } else {
        // Fallback: base64 encode (not secure, but better than plain text)
        valueToStore = btoa(key)
      }

      // Store in localStorage
      localStorage.setItem(`${STORAGE_PREFIX}${provider}`, valueToStore)
      localStorage.setItem(`${STORAGE_PREFIX}${provider}_encrypted`, this.isEncryptionSupported() ? 'true' : 'false')
      localStorage.setItem(`${STORAGE_PREFIX}${provider}_updated`, new Date().toISOString())

      // Update cache
      this.keyCache.set(provider, key)

      // Audit log
      await auditLogger.logSecurity('security.key_stored', {
        provider,
        encrypted: this.isEncryptionSupported(),
        keyPrefix: key.slice(0, 8),
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      await auditLogger.logSecurity('security.key_store_failed', {
        provider,
        error: message,
      })
      return { success: false, error: 'Failed to store API key securely' }
    }
  }

  /**
   * Retrieve an API key
   */
  async getKey(provider: APIKeyProvider): Promise<string | null> {
    // Check cache first
    if (this.keyCache.has(provider)) {
      return this.keyCache.get(provider) || null
    }

    try {
      const storedValue = localStorage.getItem(`${STORAGE_PREFIX}${provider}`)
      if (!storedValue) return null

      const wasEncrypted = localStorage.getItem(`${STORAGE_PREFIX}${provider}_encrypted`) === 'true'

      let key: string | null

      if (wasEncrypted && this.isEncryptionSupported()) {
        key = await decryptValue(storedValue)
      } else if (!wasEncrypted) {
        // Fallback: base64 decode
        try {
          key = atob(storedValue)
        } catch {
          key = storedValue // Plain text fallback
        }
      } else {
        // Encrypted but no crypto support
        console.warn('Key was encrypted but Web Crypto is not available')
        return null
      }

      // Cache the result
      this.keyCache.set(provider, key)

      return key
    } catch {
      return null
    }
  }

  /**
   * Check if a key is stored for a provider
   */
  hasKey(provider: APIKeyProvider): boolean {
    return localStorage.getItem(`${STORAGE_PREFIX}${provider}`) !== null
  }

  /**
   * Remove an API key
   */
  async removeKey(provider: APIKeyProvider): Promise<void> {
    localStorage.removeItem(`${STORAGE_PREFIX}${provider}`)
    localStorage.removeItem(`${STORAGE_PREFIX}${provider}_encrypted`)
    localStorage.removeItem(`${STORAGE_PREFIX}${provider}_updated`)

    this.keyCache.delete(provider)

    await auditLogger.logSecurity('security.key_removed', {
      provider,
    })
  }

  /**
   * Get key metadata
   */
  getKeyMetadata(provider: APIKeyProvider): {
    exists: boolean
    encrypted: boolean
    updatedAt: string | null
  } {
    const exists = this.hasKey(provider)
    return {
      exists,
      encrypted: localStorage.getItem(`${STORAGE_PREFIX}${provider}_encrypted`) === 'true',
      updatedAt: localStorage.getItem(`${STORAGE_PREFIX}${provider}_updated`),
    }
  }

  /**
   * Rotate (replace) an API key
   */
  async rotateKey(provider: APIKeyProvider, newKey: string): Promise<{
    success: boolean
    error?: string
  }> {
    const oldKeyExists = this.hasKey(provider)

    const result = await this.setKey(provider, newKey)

    if (result.success && oldKeyExists) {
      await auditLogger.logSecurity('security.key_rotated', {
        provider,
      })
    }

    return result
  }

  /**
   * Clear all stored keys
   */
  async clearAllKeys(): Promise<void> {
    const providers: APIKeyProvider[] = ['openai', 'anthropic', 'google']

    for (const provider of providers) {
      await this.removeKey(provider)
    }

    await auditLogger.logSecurity('security.all_keys_cleared', {})
  }

  /**
   * Get security status summary
   */
  getSecurityStatus(): {
    encryptionSupported: boolean
    keyCount: number
    encryptedKeyCount: number
    providers: Record<APIKeyProvider, { exists: boolean; encrypted: boolean }>
  } {
    const providers: APIKeyProvider[] = ['openai', 'anthropic', 'google']
    const status: Record<APIKeyProvider, { exists: boolean; encrypted: boolean }> = {
      openai: { exists: false, encrypted: false },
      anthropic: { exists: false, encrypted: false },
      google: { exists: false, encrypted: false },
    }

    let keyCount = 0
    let encryptedKeyCount = 0

    for (const provider of providers) {
      const metadata = this.getKeyMetadata(provider)
      status[provider] = { exists: metadata.exists, encrypted: metadata.encrypted }
      if (metadata.exists) keyCount++
      if (metadata.encrypted) encryptedKeyCount++
    }

    return {
      encryptionSupported: this.isEncryptionSupported(),
      keyCount,
      encryptedKeyCount,
      providers: status,
    }
  }
}

/**
 * Singleton instance
 */
export const secureKeyManager = new SecureKeyManager()

/**
 * Migration helper - migrate old unencrypted keys to encrypted storage
 */
export async function migrateOldKeys(): Promise<number> {
  const oldKeys: Record<APIKeyProvider, string> = {
    openai: 'insurai_openai_key',
    anthropic: 'insurai_anthropic_key',
    google: 'insurai_google_cloud_key',
  }

  let migrated = 0

  for (const [provider, oldKey] of Object.entries(oldKeys) as [APIKeyProvider, string][]) {
    const oldValue = localStorage.getItem(oldKey)
    if (oldValue && !secureKeyManager.hasKey(provider)) {
      const result = await secureKeyManager.setKey(provider, oldValue)
      if (result.success) {
        localStorage.removeItem(oldKey)
        migrated++
      }
    }
  }

  if (migrated > 0) {
    await auditLogger.logSecurity('security.keys_migrated', {
      count: migrated,
    })
  }

  return migrated
}
