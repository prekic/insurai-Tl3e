import { createClient, SupabaseClient as SupabaseClientType } from '@supabase/supabase-js'

// Supabase configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Check if we're in a browser environment and in production
const isProduction = import.meta.env.PROD
const isBrowser = typeof window !== 'undefined'

/**
 * Validate Supabase credentials
 *
 * Security: We do NOT use placeholder values because:
 * 1. Requests could go to attacker-controlled domains
 * 2. Configuration errors would be silently masked
 * 3. Data could leak to unintended destinations
 */
function validateCredentials(): { url: string; key: string } | null {
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

const credentials = validateCredentials()

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

/**
 * Create Supabase client safely
 *
 * If credentials are missing:
 * - Returns a proxy that throws descriptive errors when used
 * - This prevents silent failures and makes debugging easier
 * - The app can still work in "local-only" mode
 */
function createSafeClient(): SupabaseClientType {
  if (credentials) {
    return createClient(credentials.url, credentials.key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  }

  // Create a proxy that throws helpful errors when accessed
  // This is safer than using placeholder URLs that could be malicious
  const notConfiguredError = () => {
    throw new Error(
      'Supabase is not configured. ' +
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables. ' +
        'The app is running in local-only mode.'
    )
  }

  // Return a proxy that throws on any property access
  // This catches attempts to use supabase.auth, supabase.from(), etc.
  return new Proxy({} as SupabaseClientType, {
    get(_target, prop) {
      // Allow checking if it's configured
      if (prop === 'then' || prop === 'catch') {
        return undefined // Not a promise
      }
      // For any actual usage, throw an error
      notConfiguredError()
    },
    apply() {
      notConfiguredError()
    },
  })
}

// Create Supabase client
// Note: Type safety is handled at the service layer (policies.ts, auth.ts)
// For full type safety, generate types from Supabase:
// npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/database.types.ts
export const supabase = createSafeClient()

// Check if Supabase is properly configured
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

// Export the client type for use in other files
export type SupabaseClient = typeof supabase
