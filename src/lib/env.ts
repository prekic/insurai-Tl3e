/**
 * Environment Configuration and Validation
 * Validates required environment variables and provides type-safe access
 */

interface EnvConfig {
  // Supabase
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  isSupabaseConfigured: boolean

  // AI Providers
  openaiKey: string | null
  anthropicKey: string | null
  googleCloudKey: string | null
  isAIConfigured: boolean

  // App
  isDevelopment: boolean
  isProduction: boolean
  appUrl: string
}

interface EnvWarning {
  level: 'info' | 'warning' | 'error'
  message: string
  suggestion?: string
}

/**
 * Parse and validate environment variables
 */
function parseEnv(): EnvConfig {
  const isDev = import.meta.env.DEV
  const isProd = import.meta.env.PROD

  // Supabase
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || null
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || null
  const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

  // AI Providers
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY || null
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY || null
  const googleCloudKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY || null

  // Check if keys are placeholders
  const isValidKey = (key: string | null, prefix: string): boolean => {
    if (!key) return false
    if (key === `${prefix}...`) return false
    if (key.length < 20) return false
    return true
  }

  const isAIConfigured =
    isValidKey(openaiKey, 'sk-') || isValidKey(anthropicKey, 'sk-ant-')

  return {
    supabaseUrl,
    supabaseAnonKey,
    isSupabaseConfigured,
    openaiKey: isValidKey(openaiKey, 'sk-') ? openaiKey : null,
    anthropicKey: isValidKey(anthropicKey, 'sk-ant-') ? anthropicKey : null,
    googleCloudKey: googleCloudKey || null,
    isAIConfigured,
    isDevelopment: isDev,
    isProduction: isProd,
    appUrl: import.meta.env.VITE_APP_URL || (isDev ? 'http://localhost:5173' : ''),
  }
}

/**
 * Generate warnings for missing or misconfigured environment variables
 */
function generateWarnings(config: EnvConfig): EnvWarning[] {
  const warnings: EnvWarning[] = []

  // Supabase warnings
  if (!config.isSupabaseConfigured) {
    warnings.push({
      level: 'info',
      message: 'Supabase not configured - using local storage',
      suggestion: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for cloud storage',
    })
  }

  // AI warnings
  if (!config.isAIConfigured) {
    warnings.push({
      level: 'warning',
      message: 'No AI provider configured - using demo mode',
      suggestion:
        'Set VITE_OPENAI_API_KEY or VITE_ANTHROPIC_API_KEY for AI-powered extraction',
    })
  } else if (!config.openaiKey) {
    warnings.push({
      level: 'info',
      message: 'OpenAI not configured - using Anthropic only',
    })
  } else if (!config.anthropicKey) {
    warnings.push({
      level: 'info',
      message: 'Anthropic not configured - multi-model consensus unavailable',
    })
  }

  // OCR warning
  if (!config.googleCloudKey) {
    warnings.push({
      level: 'info',
      message: 'Google Cloud not configured - OCR for scanned documents unavailable',
    })
  }

  // Production warnings
  if (config.isProduction) {
    if (!config.isSupabaseConfigured) {
      warnings.push({
        level: 'error',
        message: 'Production build without Supabase - data will not persist across sessions',
      })
    }
  }

  return warnings
}

/**
 * Log environment status to console (development only)
 */
function logEnvironmentStatus(config: EnvConfig, warnings: EnvWarning[]): void {
  if (!config.isDevelopment) return

  console.group('🔧 InsurAI Environment')

  // Config summary
  console.log(
    '%cConfiguration:',
    'font-weight: bold',
    {
      mode: config.isDevelopment ? 'development' : 'production',
      storage: config.isSupabaseConfigured ? 'cloud' : 'local',
      ai: config.isAIConfigured
        ? config.openaiKey && config.anthropicKey
          ? 'multi-model'
          : 'single-model'
        : 'demo',
      ocr: config.googleCloudKey ? 'enabled' : 'disabled',
    }
  )

  // Warnings
  if (warnings.length > 0) {
    console.log('%cWarnings:', 'font-weight: bold')
    warnings.forEach((warning) => {
      const styles = {
        info: 'color: #3b82f6',
        warning: 'color: #f59e0b',
        error: 'color: #ef4444; font-weight: bold',
      }
      console.log(`%c[${warning.level.toUpperCase()}] ${warning.message}`, styles[warning.level])
      if (warning.suggestion) {
        console.log(`  → ${warning.suggestion}`)
      }
    })
  }

  console.groupEnd()
}

// Parse environment on module load
const envConfig = parseEnv()
const envWarnings = generateWarnings(envConfig)

// Log status in development
logEnvironmentStatus(envConfig, envWarnings)

/**
 * Get environment configuration
 */
export function getEnvConfig(): EnvConfig {
  return envConfig
}

/**
 * Get environment warnings
 */
export function getEnvWarnings(): EnvWarning[] {
  return envWarnings
}

/**
 * Check if environment is properly configured for production
 */
export function isProductionReady(): boolean {
  return envConfig.isProduction && envConfig.isSupabaseConfigured && envConfig.isAIConfigured
}

/**
 * Validate environment and throw if critical configuration is missing
 */
export function validateEnvironment(): void {
  const criticalErrors = envWarnings.filter((w) => w.level === 'error')

  if (criticalErrors.length > 0 && envConfig.isProduction) {
    const messages = criticalErrors.map((e) => e.message).join('\n')
    console.error('Critical environment configuration errors:\n' + messages)
  }
}

// Export individual checks for convenience
export const env = {
  config: envConfig,
  warnings: envWarnings,
  isDev: envConfig.isDevelopment,
  isProd: envConfig.isProduction,
  hasSupabase: envConfig.isSupabaseConfigured,
  hasAI: envConfig.isAIConfigured,
  hasOCR: !!envConfig.googleCloudKey,
  hasConsensus: !!(envConfig.openaiKey && envConfig.anthropicKey),
}

export default env
