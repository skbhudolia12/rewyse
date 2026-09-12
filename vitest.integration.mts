import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // These share one database; parallel files would fight over the same rows.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Lets server modules be imported directly under test. The real package
      // still guards the application bundle.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
});
