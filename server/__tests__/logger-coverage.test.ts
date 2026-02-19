/**
 * Logger Coverage Tests
 *
 * Targets uncovered branches in server/lib/logger.ts:
 * - getMinLevel: LOG_LEVEL env var, NODE_ENV checks
 * - shouldLog: all level comparisons
 * - formatMessage: production vs development, with/without data, empty data
 * - createLogger: all 4 log methods, child chaining
 * - setLogLevel / getLogLevel
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  process.env = { ...originalEnv }
})

afterEach(() => {
  process.env = originalEnv
  vi.restoreAllMocks()
})

async function importFresh() {
  vi.resetModules()
  return await import('../lib/logger.js')
}

// =============================================================================
// getMinLevel branches
// =============================================================================
describe('getMinLevel', () => {
  it('uses LOG_LEVEL env var when set to valid level', async () => {
    process.env.LOG_LEVEL = 'warn'
    process.env.NODE_ENV = 'development'
    const mod = await importFresh()
    expect(mod.getLogLevel()).toBe('warn')
  })

  it('uses LOG_LEVEL=error when set', async () => {
    process.env.LOG_LEVEL = 'error'
    const mod = await importFresh()
    expect(mod.getLogLevel()).toBe('error')
  })

  it('uses LOG_LEVEL=debug when set', async () => {
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    expect(mod.getLogLevel()).toBe('debug')
  })

  it('uses LOG_LEVEL=info when set', async () => {
    process.env.LOG_LEVEL = 'info'
    const mod = await importFresh()
    expect(mod.getLogLevel()).toBe('info')
  })

  it('ignores case for LOG_LEVEL', async () => {
    process.env.LOG_LEVEL = 'WARN'
    const mod = await importFresh()
    expect(mod.getLogLevel()).toBe('warn')
  })

  it('falls back to info in production when LOG_LEVEL not set', async () => {
    delete process.env.LOG_LEVEL
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()
    expect(mod.getLogLevel()).toBe('info')
  })

  it('falls back to debug in development when LOG_LEVEL not set', async () => {
    delete process.env.LOG_LEVEL
    process.env.NODE_ENV = 'development'
    const mod = await importFresh()
    expect(mod.getLogLevel()).toBe('debug')
  })

  it('falls back to debug when NODE_ENV is not set', async () => {
    delete process.env.LOG_LEVEL
    delete process.env.NODE_ENV
    const mod = await importFresh()
    expect(mod.getLogLevel()).toBe('debug')
  })

  it('ignores invalid LOG_LEVEL value', async () => {
    process.env.LOG_LEVEL = 'verbose' // not a valid level
    process.env.NODE_ENV = 'production'
    const mod = await importFresh()
    expect(mod.getLogLevel()).toBe('info') // falls back to production default
  })
})

// =============================================================================
// shouldLog behavior via log method calls
// =============================================================================
describe('shouldLog filtering', () => {
  it('debug messages are suppressed when level is info', async () => {
    process.env.LOG_LEVEL = 'info'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mod.logger.debug('should be suppressed')
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })

  it('info messages are shown when level is info', async () => {
    process.env.LOG_LEVEL = 'info'
    process.env.NODE_ENV = 'development'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mod.logger.info('should appear')
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })

  it('warn messages are shown when level is info', async () => {
    process.env.LOG_LEVEL = 'info'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mod.logger.warn('should appear')
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })

  it('error messages are shown when level is info', async () => {
    process.env.LOG_LEVEL = 'info'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mod.logger.error('should appear')
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })

  it('debug+info messages are suppressed when level is warn', async () => {
    process.env.LOG_LEVEL = 'warn'
    const mod = await importFresh()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mod.logger.debug('suppressed')
    mod.logger.info('suppressed')
    expect(logSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('only error messages are shown when level is error', async () => {
    process.env.LOG_LEVEL = 'error'
    const mod = await importFresh()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mod.logger.debug('suppressed')
    mod.logger.info('suppressed')
    mod.logger.warn('suppressed')
    mod.logger.error('shown')

    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('all messages are shown when level is debug', async () => {
    process.env.LOG_LEVEL = 'debug'
    process.env.NODE_ENV = 'development'
    const mod = await importFresh()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mod.logger.debug('shown')
    mod.logger.info('shown')
    mod.logger.warn('shown')
    mod.logger.error('shown')

    expect(logSpy).toHaveBeenCalledTimes(2) // debug + info
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})

// =============================================================================
// formatMessage branches
// =============================================================================
describe('formatMessage', () => {
  it('produces JSON in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mod.logger.info('test message', { key: 'value' })

    expect(spy).toHaveBeenCalled()
    const output = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('test message')
    expect(parsed.data.key).toBe('value')
    expect(parsed.ts).toBeDefined()

    spy.mockRestore()
  })

  it('produces JSON without data field when data is empty', async () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mod.logger.info('no data')

    const output = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)
    expect(parsed.data).toBeUndefined()

    spy.mockRestore()
  })

  it('produces JSON without data field when data is empty object', async () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mod.logger.info('empty data', {})

    const output = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)
    expect(parsed.data).toBeUndefined()

    spy.mockRestore()
  })

  it('produces human-readable format in development', async () => {
    process.env.NODE_ENV = 'development'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mod.logger.info('test message', { key: 'value' })

    const output = spy.mock.calls[0][0] as string
    expect(output).toContain('test message')
    expect(output).toContain('"key":"value"')

    spy.mockRestore()
  })

  it('produces human-readable format without data suffix when data is empty', async () => {
    process.env.NODE_ENV = 'development'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mod.logger.info('no data message')

    const output = spy.mock.calls[0][0] as string
    expect(output).toContain('no data message')
    expect(output).not.toContain('{')

    spy.mockRestore()
  })

  it('includes tag in human-readable format', async () => {
    process.env.NODE_ENV = 'development'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const child = mod.logger.child('TestModule')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    child.info('tagged message')

    const output = spy.mock.calls[0][0] as string
    expect(output).toContain('[TestModule]')

    spy.mockRestore()
  })

  it('includes tag in production JSON', async () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const child = mod.logger.child('MyModule')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    child.info('msg')

    const output = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)
    expect(parsed.tag).toBe('MyModule')

    spy.mockRestore()
  })

  it('root logger has empty tag', async () => {
    process.env.NODE_ENV = 'development'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mod.logger.info('root message')

    const output = spy.mock.calls[0][0] as string
    // Empty tag produces "[] " prefix
    expect(output).toContain('root message')

    spy.mockRestore()
  })
})

// =============================================================================
// child logger chaining
// =============================================================================
describe('child logger', () => {
  it('creates nested child tags', async () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const child1 = mod.logger.child('Parent')
    const child2 = child1.child('Child')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    child2.info('nested')

    const output = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)
    expect(parsed.tag).toBe('Parent:Child')

    spy.mockRestore()
  })

  it('child from root logger uses just the child tag', async () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()
    const child = mod.logger.child('Root')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    child.info('msg')

    const output = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)
    // Root logger tag is empty string, so child is just 'Root'
    expect(parsed.tag).toBe('Root')

    spy.mockRestore()
  })
})

// =============================================================================
// setLogLevel / getLogLevel
// =============================================================================
describe('setLogLevel / getLogLevel', () => {
  it('changes the log level at runtime', async () => {
    process.env.LOG_LEVEL = 'debug'
    const mod = await importFresh()

    expect(mod.getLogLevel()).toBe('debug')

    mod.setLogLevel('error')
    expect(mod.getLogLevel()).toBe('error')

    // Verify that info messages are now suppressed
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mod.logger.info('should be suppressed')
    expect(spy).not.toHaveBeenCalled()

    // error should still work
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mod.logger.error('should show')
    expect(errorSpy).toHaveBeenCalled()

    spy.mockRestore()
    errorSpy.mockRestore()
  })

  it('can reset to debug level', async () => {
    process.env.LOG_LEVEL = 'error'
    const mod = await importFresh()

    mod.setLogLevel('debug')
    expect(mod.getLogLevel()).toBe('debug')

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mod.logger.debug('should show now')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

// =============================================================================
// default export
// =============================================================================
describe('default export', () => {
  it('exports logger as default', async () => {
    const mod = await importFresh()
    expect(mod.default).toBeDefined()
    expect(typeof mod.default.info).toBe('function')
    expect(typeof mod.default.warn).toBe('function')
    expect(typeof mod.default.error).toBe('function')
    expect(typeof mod.default.debug).toBe('function')
    expect(typeof mod.default.child).toBe('function')
  })
})
