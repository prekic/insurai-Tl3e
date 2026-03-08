import { lazy, ComponentType } from 'react'

/**
 * A wrapper for React.lazy that automatically reloads the page once
 * if a dynamic import fails (usually due to a chunk load error after a new deployment).
 *
 * @param componentImport The dynamic import function, e.g., () => import('./MyComponent')
 * @param name An identifier for the chunk to prevent infinite reload loops
 */
export const lazyRetry = <T extends ComponentType<unknown>>(
  componentImport: () => Promise<{ default: T }>,
  name: string
) => {
  return lazy(async () => {
    const sessionKey = `lazy-retry-${name}`
    try {
      const component = await componentImport()
      // On success, clear the retry flag so future loads can retry if needed
      sessionStorage.removeItem(sessionKey)
      return component
    } catch (error) {
      // Check if it's a chunk load error
      const isChunkLoadError =
        error instanceof TypeError &&
        (error.message.includes('Failed to fetch dynamically imported module') ||
          error.message.includes('Importing a module script failed') ||
          error.message.includes('error loading dynamically imported module'))

      if (isChunkLoadError) {
        const hasRetried = sessionStorage.getItem(sessionKey)
        if (!hasRetried) {
          sessionStorage.setItem(sessionKey, 'true')
          // Force a hard reload from the server to get the latest index.html and chunk mappings
          window.location.reload()

          // Return a never-resolving promise so React doesn't try to render the
          // error boundary/fallback before the page fully reloads
          return new Promise<{ default: T }>(() => {})
        }
      }

      // If it's not a chunk error or we already retried, let it crash to the ErrorBoundary
      throw error
    }
  })
}
