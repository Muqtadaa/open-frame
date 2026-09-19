import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Mirrors the `define` in vite.config.ts; without it the global is undefined
  // under test and every guarded branch throws.
  define: { __OPENFRAME_BENCH__: 'false' },
  test: {
    environment: 'jsdom',
    /*
     * `wss://` ON PURPOSE, because that is the value production runs and the
     * one that broke: a single configured URL is used both to open a socket
     * and to POST a claim, and `fetch` rejects a websocket scheme outright.
     * Setting `https://` here would make `collab-config.test.ts` pass against
     * the one configuration that never had the bug.
     */
    env: { VITE_COLLAB_URL: 'wss://rooms.test' },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
