import { vi } from 'vitest';
/**
 * Whether the test runs in JSDOM environment
 */
export const isJSDOM = /jsdom/.test(window.navigator.userAgent);

// https://stackoverflow.com/questions/53807517/how-to-test-if-two-types-are-exactly-the-same
export type IfEquals<T, U, Y = unknown, N = never> =
  (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2 ? Y : N;

/**
 * Issues a type error if `Expected` is not identical to `Actual`.
 */
export function expectType<Expected, Actual>(_actual: IfEquals<Actual, Expected, Actual>): void {}

/**
 * Lets the current test's own fixture trigger the given Solid reactivity diagnostics.
 *
 * The suite fails on them (see `test/setup.ts`). A few tests need app code that does what the
 * diagnostics warn about, such as an effect that closes a menu as soon as it opens, to check that
 * the component copes with it. Every other warning still fails the test.
 */
export function allowSolidDiagnostics(...codes: string[]) {
  const warn = console.warn;
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const message = args.map(String).join(' ');
    const isAllowed =
      codes.some((code) => message.includes(`[${code}]`)) ||
      // The footer Solid adds to the first report of a code.
      /docs\.solidjs\.com|reactivity-diagnostics|attribution\.enable/.test(message);
    if (!isAllowed) {
      warn(...args);
    }
  });
}
