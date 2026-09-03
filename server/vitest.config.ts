import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // API tests hit a real shared Postgres DB, including global counters
    // (TicketCounter) — running test files in parallel lets unrelated
    // files' Ticket creations interleave with a file that asserts on
    // strictly-sequential numbering. Serialize files to keep that
    // deterministic.
    fileParallelism: false,
  },
})
