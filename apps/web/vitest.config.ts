import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Mirrors the `define` in vite.config.ts; without it the global is undefined
  // under test and every guarded branch throws.
  define: { __OPENFRAME_BENCH__: 'false' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
