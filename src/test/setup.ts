import '@testing-library/jest-dom'

// Mock window.scrollTo - jsdom doesn't implement it
Object.defineProperty(window, 'scrollTo', {
  value: () => {},
  writable: true,
})

// Mock window.scroll - similar to scrollTo
Object.defineProperty(window, 'scroll', {
  value: () => {},
  writable: true,
})

// Mock Element.scrollIntoView - commonly used in UI components
Element.prototype.scrollIntoView = () => {}

// Mock matchMedia - used by responsive components and framer-motion
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock ResizeObserver - used by many UI libraries
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
