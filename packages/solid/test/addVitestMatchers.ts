import { expect } from 'vitest';
import { isInaccessible, prettyDOM } from '@testing-library/dom';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Match Vitest's type parameters for declaration merging.
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    /**
     * Checks if the element is not exposed to assistive technology.
     * Provided by the `@mui/internal-test-utils` matchers in the React package.
     */
    toBeInaccessible(): R;
  }
}

expect.extend({
  toBeInaccessible(received: Element) {
    const pass = isInaccessible(received);
    const element = prettyDOM(received, undefined, { maxDepth: 1 });

    return {
      pass,
      message: () =>
        pass
          ? `expected \n${element} to be accessible but it was inaccessible`
          : `expected \n${element} to be inaccessible but it was accessible`,
    };
  },
});

export type {};
