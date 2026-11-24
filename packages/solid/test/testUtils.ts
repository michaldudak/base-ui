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
