import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'

// Node's own built-in `localStorage` global (present since Node 22,
// gated behind --localstorage-file) shadows jsdom's window.localStorage
// under Vitest's jsdom environment, leaving both undefined. Replace it
// with a minimal in-memory implementation so localStorage works the same
// in tests as in a real browser.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length() {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
})
Object.defineProperty(window, 'localStorage', {
  value: globalThis.localStorage,
  configurable: true,
  writable: true,
})

// Each test starts at the same URL with empty storage, and with no network:
// `client/src/api.ts` is mocked call by call, and a call a test leaves unmocked
// fails as it does with no server, whatever API is running on this machine.
beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
})
