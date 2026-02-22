/**
 * Supabase configuration constants and connection validation.
 * Separated from client.ts to prevent eager loading of the heavy @supabase/supabase-js package
 * during initial app boot, when only checking if credentials exist.
 */

// Supabase configuration from environment variables
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Check if we're in a browser environment and in production
export const isProduction = import.meta.env.PROD
export const isBrowser = typeof window !== 'undefined'

/**
 * Validate Supabase credentials
 *
 * Security: We do NOT use placeholder values because:
 * 1. Requests could go to attacker-controlled domains
 * 2. Configuration errors would be silently masked
 * 3. Data could leak to unintended destinations
 */
export function validateCredentials(): { url: string; key: string } | null {
    if (!supabaseUrl || !supabaseAnonKey) {
        return null
    }

    // Basic URL validation - must be a valid Supabase URL
    try {
        const url = new URL(supabaseUrl)
        if (!url.hostname.includes('supabase')) {
            console.warn('[Supabase] URL does not appear to be a Supabase endpoint:', url.hostname)
        }
    } catch {
        console.error('[Supabase] Invalid VITE_SUPABASE_URL - not a valid URL')
        return null
    }

    // Key should be a JWT (starts with eyJ)
    if (!supabaseAnonKey.startsWith('eyJ')) {
        console.warn('[Supabase] VITE_SUPABASE_ANON_KEY does not appear to be a valid JWT')
    }

    return { url: supabaseUrl, key: supabaseAnonKey }
}

export const credentials = validateCredentials()

// Log configuration status (but not the actual values)
if (!credentials) {
    const message = 'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
    if (isProduction && isBrowser) {
        // In production browser, log error but don't crash - app can work in local-only mode
        console.error(`[Supabase] ${message}`)
    } else {
        console.warn(`[Supabase] ${message}`)
    }
}

// Check if Supabase is properly configured
export const isSupabaseConfigured = (): boolean => {
    return Boolean(supabaseUrl && supabaseAnonKey)
}
