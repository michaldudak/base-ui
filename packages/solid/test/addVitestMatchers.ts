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

function isVisibilityVisible(element: Element) {
  const isAttached = element.getRootNode({ composed: true }) === document;
  const visibility = isAttached
    ? window.getComputedStyle(element).visibility
    : (element as HTMLElement).style.visibility;
  return visibility !== 'hidden' && visibility !== 'collapse';
}

expect.extend({
  // In the React package `toBeVisible` and `toBeHidden` are the `chai-dom` assertions that
  // `@mui/internal-test-utils` installs, which only look at the computed `visibility`. They take
  // precedence there over the stricter `@testing-library/jest-dom` matchers of the same name
  // (which also check `display`, `opacity` and every ancestor). The ported tests rely on the
  // lenient ones, for example for a popup that has no anchor and so keeps `opacity: 0`.
  toBeVisible(received: Element) {
    const pass = isVisibilityVisible(received);
    return {
      pass,
      message: () =>
        `expected \n${prettyDOM(received, undefined, { maxDepth: 1 })} ${pass ? 'not ' : ''}to be visible`,
    };
  },
  toBeHidden(received: Element) {
    const pass = !isVisibilityVisible(received);
    return {
      pass,
      message: () =>
        `expected \n${prettyDOM(received, undefined, { maxDepth: 1 })} ${pass ? 'not ' : ''}to be hidden`,
    };
  },
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
