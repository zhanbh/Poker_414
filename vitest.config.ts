import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'shared/test/**/*.test.ts',
      'server/test/**/*.test.ts',
      'client/test/**/*.test.tsx',
      'tests/**/*.test.ts',
    ],
    passWithNoTests: false,
  },
});
