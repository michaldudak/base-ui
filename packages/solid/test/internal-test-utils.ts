/**
 * Solid stand-in for `@mui/internal-test-utils`.
 *
 * The Vitest config aliases `@mui/internal-test-utils` to this file, so tests ported from
 * `@base-ui/react` keep their import lines. Every helper keeps the timing its React counterpart
 * has under `act()`: pending Solid updates are applied before the helper returns.
 */
import {
  buildQueries,
  configure,
  createEvent,
  fireEvent as dtlFireEvent,
  prettyDOM,
  queries,
  screen as dtlScreen,
  waitFor,
  within,
} from '@testing-library/dom';
import { flush } from 'solid-js';
import { describe } from 'vitest';

export { cleanup } from '@solidjs/testing-library';
export { configure, createEvent, waitFor, within, prettyDOM };

function queryAllDescriptionsOf(baseElement: HTMLElement, element: Element): HTMLElement[] {
  const ariaDescribedBy = element.getAttribute('aria-describedby');
  if (ariaDescribedBy === null) {
    return [];
  }
  return ariaDescribedBy
    .split(' ')
    .map((id) => document.getElementById(id))
    .filter((maybeElement): maybeElement is HTMLElement => {
      return maybeElement !== null && baseElement.contains(maybeElement);
    });
}

const [
  queryDescriptionOf,
  getAllDescriptionsOf,
  getDescriptionOf,
  findAllDescriptionsOf,
  findDescriptionOf,
] = buildQueries(
  queryAllDescriptionsOf,
  () => 'Found multiple descriptions.',
  () => 'Found no describing element.',
);

export const customQueries = {
  queryDescriptionOf,
  queryAllDescriptionsOf,
  getDescriptionOf,
  getAllDescriptionsOf,
  findDescriptionOf,
  findAllDescriptionsOf,
};

export const allQueries = { ...queries, ...customQueries };

export const screen = {
  ...dtlScreen,
  ...within(document.body, allQueries),
};

/**
 * Yields to the event loop once, with a scheduler fake timers do not replace.
 * React's async `act()` does the same, which lets promise chains settle.
 */
function yieldToMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value != null && typeof (value as PromiseLike<unknown>).then === 'function';
}

/**
 * Runs the callback and applies the Solid updates it caused.
 *
 * - Synchronous callback: the updates are applied before `act` returns.
 * - Awaited (`await act(...)`), or asynchronous callback: also waits one turn of the event loop,
 *   like React's `act`.
 */
export function act<T>(callback: () => T | Promise<T>): Promise<T> {
  const result = callback();

  if (isThenable(result)) {
    return (async () => {
      const value = await result;
      flush();
      await yieldToMacrotask();
      flush();
      return value;
    })();
  }

  flush();
  return {
    then(onFulfilled: any, onRejected: any) {
      return yieldToMacrotask()
        .then(() => {
          flush();
          return result;
        })
        .then(onFulfilled, onRejected);
    },
  } as Promise<T>;
}

export async function flushMicrotasks() {
  await act(async () => {});
}

// Every event Testing Library dispatches (through `fireEvent` or `user-event`) applies pending
// Solid updates before returning, the way React Testing Library wraps events in `act()`.
// After each `user-event` call the queue of 0 ms timers is drained, also like React Testing Library.
configure({
  eventWrapper: (cb) => {
    const result = cb();
    flush();
    return result;
  },
  asyncWrapper: async (cb) => {
    const result = await cb();
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 0);
    });
    flush();
    return result;
  },
});

type FireEvent = typeof dtlFireEvent;

export const fireEvent = ((target: any, event: any) => dtlFireEvent(target, event)) as FireEvent;

(Object.keys(dtlFireEvent) as (keyof FireEvent)[]).forEach((eventType) => {
  (fireEvent as any)[eventType] = (...args: any[]) => (dtlFireEvent as any)[eventType](...args);
});

// React Testing Library also dispatches the bubbling variants, because React listens to those.
// The Solid components listen to `focusin`/`focusout` for the same reason.
fireEvent.focus = (node: any, init?: any) => {
  const result = dtlFireEvent.focus(node, init);
  dtlFireEvent.focusIn(node, init);
  return result;
};
fireEvent.blur = (node: any, init?: any) => {
  const result = dtlFireEvent.blur(node, init);
  dtlFireEvent.focusOut(node, init);
  return result;
};

function assertTargetsActiveElement(element: any, eventName: string) {
  const doc = element.ownerDocument || element;
  const target = doc.activeElement || doc.body || doc.documentElement;
  if (target !== element) {
    throw new Error(
      `\`${eventName}\` events can only be targeted at the active element which is ${prettyDOM(
        target,
        undefined,
        { maxDepth: 1 },
      )}`,
    );
  }
}

fireEvent.keyDown = (element: any, options: any = {}) => {
  assertTargetsActiveElement(element, 'keydown');
  return dtlFireEvent.keyDown(element, options);
};

fireEvent.keyUp = (element: any, options: any = {}) => {
  assertTargetsActiveElement(element, 'keyup');
  return dtlFireEvent.keyUp(element, options);
};

export function randomStringValue() {
  return `s${Math.random().toString(36).slice(2)}`;
}

export function createDescribe<Args extends any[]>(
  message: string,
  callback: (...args: Args) => void,
) {
  const customDescribe = (...args: Args) => {
    describe(message, () => {
      callback(...args);
    });
  };
  customDescribe.skip = (...args: Args) => {
    describe.skip(message, () => {
      callback(...args);
    });
  };
  customDescribe.only = (...args: Args) => {
    describe.only(message, () => {
      callback(...args);
    });
  };
  return customDescribe;
}

export function isJsdom() {
  return window.navigator.userAgent.includes('jsdom');
}

/**
 * There are no `act()` warnings in Solid. Kept so ported tests do not have to change.
 */
export function ignoreActWarnings() {}
