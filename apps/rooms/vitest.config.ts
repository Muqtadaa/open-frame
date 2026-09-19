import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node, not workerd: everything worth testing here is in @openframe/collab,
    // and this package is the thin adapter that holds sockets and storage.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
