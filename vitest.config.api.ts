import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/backend/**/*.test.ts'],
    environment: 'node',
    globals: true, // using globals like describe, it
    setupFiles: ['tests/backend/setup-env.ts'], // load env vars for test
  },
});
