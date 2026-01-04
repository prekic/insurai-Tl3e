/**
 * Preflight Configuration Check
 *
 * Validates that the application is properly configured before allowing use.
 * This prevents silent fallback to demo mode when things are broken.
 */

export interface PreflightResult {
  ready: boolean
  errors: string[]
  warnings: string[]
  config: {
    supabase: boolean
    apiProxy: boolean
    sentry: boolean
    aiProviders: {
      openai: boolean
      anthropic: boolean
      google: boolean
    } | null
  }
}

/**
 * Run preflight checks to validate configuration
 */
export async function runPreflightCheck(): Promise<PreflightResult> {
  const errors: string[] = []
  const warnings: string[] = []

  const config: PreflightResult['config'] = {
    supabase: false,
    apiProxy: false,
    sentry: false,
    aiProviders: null,
  }

  // Check Supabase configuration
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    errors.push('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  } else {
    config.supabase = true
  }

  // Check Sentry configuration
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN
  if (!sentryDsn) {
    warnings.push('Sentry is not configured. Error tracking is disabled.')
  } else {
    config.sentry = true
  }

  // Check API proxy configuration and connectivity
  const proxyUrl = import.meta.env.VITE_API_PROXY_URL
  if (!proxyUrl) {
    errors.push(
      'API proxy is not configured. Set VITE_API_PROXY_URL to enable AI extraction. ' +
      'Without this, the app can only show demo data.'
    )
  } else {
    // Try to connect to the proxy
    try {
      const response = await fetch(`${proxyUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        config.apiProxy = true
        const data = await response.json()

        if (data.providers) {
          config.aiProviders = data.providers
          const hasProvider = data.providers.openai || data.providers.anthropic || data.providers.google

          if (!hasProvider) {
            errors.push(
              'Backend server is running but no AI providers are configured. ' +
              'Set OPENAI_API_KEY or ANTHROPIC_API_KEY in the server .env file.'
            )
          }
        }
      } else {
        errors.push(
          `API proxy at ${proxyUrl} returned status ${response.status}. ` +
          'Check that the server is running correctly.'
        )
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errors.push(
            `API proxy at ${proxyUrl} is not responding (timeout). ` +
            'Make sure to run: npm run dev:all'
          )
        } else {
          errors.push(
            `Cannot connect to API proxy at ${proxyUrl}. ` +
            'Start the backend server with: npm run dev:server'
          )
        }
      }
    }
  }

  return {
    ready: errors.length === 0,
    errors,
    warnings,
    config,
  }
}

/**
 * Log preflight results to console
 */
export function logPreflightResults(result: PreflightResult): void {
  console.group('🔍 InsurAI Preflight Check')

  if (result.ready) {
    console.log('✅ All systems ready')
  } else {
    console.error('❌ Configuration issues detected')
  }

  console.log('')
  console.log('Configuration:')
  console.log(`  Supabase:   ${result.config.supabase ? '✓' : '✗'}`)
  console.log(`  API Proxy:  ${result.config.apiProxy ? '✓' : '✗'}`)
  console.log(`  Sentry:     ${result.config.sentry ? '✓' : '✗'}`)

  if (result.config.aiProviders) {
    console.log('  AI Providers:')
    console.log(`    OpenAI:    ${result.config.aiProviders.openai ? '✓' : '✗'}`)
    console.log(`    Anthropic: ${result.config.aiProviders.anthropic ? '✓' : '✗'}`)
    console.log(`    Google:    ${result.config.aiProviders.google ? '✓' : '✗'}`)
  }

  if (result.errors.length > 0) {
    console.log('')
    console.error('Errors:')
    result.errors.forEach((error) => {
      console.error(`  ❌ ${error}`)
    })
  }

  if (result.warnings.length > 0) {
    console.log('')
    console.warn('Warnings:')
    result.warnings.forEach((warning) => {
      console.warn(`  ⚠️ ${warning}`)
    })
  }

  console.groupEnd()
}
