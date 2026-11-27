import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Tests read the shared contract from source, so `pnpm test` works on a fresh clone without a build.
    alias: {
      '@ai-job-search/shared': decodeURIComponent(new URL('../../packages/shared/src/index.ts', import.meta.url).pathname),
    },
  },
  test: {
    include: ['src/**/*.spec.{ts,tsx}'],
    // Components render to static markup with react-dom/server; no DOM needed.
    environment: 'node',
  },
});
