/**
 * Structured Logger
 *
 * Thin wrapper over console that adds:
 * - Log level filtering based on NODE_ENV / LOG_LEVEL
 * - Structured JSON output in production
 * - Human-readable output in development
 * - Tagged child loggers for per-module prefixing
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase()
  if (envLevel && envLevel in LEVEL_PRIORITY) return envLevel as LogLevel

  // In production, show info and above (not debug).
  // Use LOG_LEVEL=warn to suppress info if needed.
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
let minLevel = getMinLevel()

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel]
}

function formatMessage(level: LogLevel, tag: string, message: string, data?: Record<string, unknown>): string {
  if (IS_PRODUCTION) {
    // Structured JSON for log aggregators (Railway, Datadog, etc.)
    return JSON.stringify({
      level,
      tag,
      msg: message,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
      ts: new Date().toISOString(),
    })
  }

  // Human-readable for development
  const prefix = tag ? `[${tag}]` : ''
  const suffix = data && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : ''
  return `${prefix} ${message}${suffix}`
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
  child(tag: string): Logger
}

function createLogger(tag: string): Logger {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (shouldLog('debug')) console.log(formatMessage('debug', tag, message, data))
    },
    info(message: string, data?: Record<string, unknown>) {
      if (shouldLog('info')) console.log(formatMessage('info', tag, message, data))
    },
    warn(message: string, data?: Record<string, unknown>) {
      if (shouldLog('warn')) console.warn(formatMessage('warn', tag, message, data))
    },
    error(message: string, data?: Record<string, unknown>) {
      if (shouldLog('error')) console.error(formatMessage('error', tag, message, data))
    },
    child(childTag: string): Logger {
      return createLogger(tag ? `${tag}:${childTag}` : childTag)
    },
  }
}

/** Root logger instance. Use `logger.child('ModuleName')` for tagged logging. */
export const logger = createLogger('')

/** Set the minimum log level at runtime. */
export function setLogLevel(level: LogLevel): void {
  minLevel = level
}

/** Get the current minimum log level. */
export function getLogLevel(): LogLevel {
  return minLevel
}

export default logger
