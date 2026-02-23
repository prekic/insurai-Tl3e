import { createClient, SupabaseClient as SupabaseClientType } from '@supabase/supabase-js'
import { credentials, isSupabaseConfigured } from './config'

export { isSupabaseConfigured }

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

// Export the client type for use in other files
export type SupabaseClient = typeof supabase
