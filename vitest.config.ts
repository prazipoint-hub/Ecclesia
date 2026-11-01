import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/**/types/**'],
      reporter: ['text-summary', 'json-summary'],
      // Thresholds are a floor, not a goal: raise them as coverage grows, never lower them to make CI pass.
      thresholds: { statements: 83, branches: 82, functions: 78, lines: 83 },
    },
  },
});
