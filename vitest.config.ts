import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.ts',
      'contracts/**/*.test.ts',
      'packages/**/*.test.ts',
      'src/**/*.test.ts',
    ],
  },
});
