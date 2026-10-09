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
      'minigame/test/**/*.test.js',
      'minigame-414/test/**/*.test.js',
    ],
    passWithNoTests: false,
  },
});
