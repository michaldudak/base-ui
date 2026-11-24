import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import solid from '@solidjs/vite-plugin';

export default defineProject({
  plugins: [solid()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
  },
  resolve: {
    conditions: ['development', 'browser'],
    alias: {
      // Tests ported from `@base-ui/react` keep importing their helpers from here.
      '@mui/internal-test-utils': fileURLToPath(
        new URL('./test/internal-test-utils.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: '@base-ui/solid',
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { pretendToBeVisual: true, url: 'http://localhost' },
    },
    setupFiles: ['./test/setup.ts'],
    exclude: ['node_modules', 'build'],
  },
});
