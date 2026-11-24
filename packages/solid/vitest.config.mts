import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import solid from '@solidjs/vite-plugin';
import { playwright } from '@vitest/browser-playwright';

// `VITEST_ENV=chromium pnpm vitest run` runs the suite in a real browser, like `@base-ui/react`.
const browserName = process.env.VITEST_ENV;
const isBrowser = browserName === 'chromium' || browserName === 'firefox' || browserName === 'webkit';

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
    browser: isBrowser
      ? {
          enabled: true,
          provider: playwright({
            contextOptions: { timezoneId: 'UTC' },
            // Lets a machine with a preinstalled browser point Playwright at it.
            launchOptions: process.env.BROWSER_EXECUTABLE_PATH
              ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
              : undefined,
          }),
          screenshotFailures: false,
          headless: true,
          instances: [{ browser: browserName }],
        }
      : undefined,
    exclude: ['node_modules', 'build'],
  },
});
