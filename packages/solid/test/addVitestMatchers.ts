import { beforeAll, expect } from 'vitest';
import { isInaccessible, prettyDOM } from '@testing-library/dom';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';

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

// Registered in `beforeAll` so that they replace the jest-dom matchers whatever the order in
// which the setup modules are evaluated.
beforeAll(() => {
  expect.extend({
    // In the React package `toBeVisible` is the `chai-dom` assertion that
    // `@mui/internal-test-utils` installs, which only looks at the computed `visibility`. It takes
    // precedence there over the stricter `@testing-library/jest-dom` matcher of the same name
    // (which also check `display`, `opacity` and every ancestor). The ported tests rely on the
    // lenient one, for example for a popup that has no anchor and so keeps `opacity: 0`.
    //
    // A negated assertion (`not.toBeVisible()`) keeps the strict jest-dom check: an element only
    // counts as not visible when it, or an ancestor, is really hidden.
    toBeVisible(received: Element) {
      if (this.isNot) {
        return jestDomMatchers.toBeVisible.call(this as never, received as HTMLElement);
      }
      const pass = isVisibilityVisible(received);
      return {
        pass,
        message: () =>
          `expected \n${prettyDOM(received, undefined, { maxDepth: 1 })} ${pass ? 'not ' : ''}to be visible`,
      };
    },
  });
});

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
