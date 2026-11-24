import { createEffect, createMemo, onSettled } from 'solid-js';

type Cleanup = void | (() => void);

function areDepsEqual(a: readonly unknown[], b: readonly unknown[]) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

/**
 * The Solid counterpart of `React.useEffect(effect, deps)`.
 *
 * `deps` is a function that reads the reactive values the effect depends on and returns them as
 * an array. `effect` runs after the DOM is updated: once after the component is created, and
 * again whenever one of the returned values changed (compared with `Object.is`, like React).
 * It receives the values and may return a cleanup function.
 *
 * `effect` must not read signals or accessors itself: Solid does not track reads there (and warns
 * in development). Take what it needs from `deps`. Synchronous store reads (`store.state`,
 * `store.select()`) and plain variables are fine.
 *
 * Differences from React to keep in mind:
 * - Effects of a parent run before the effects of its children (React runs children first).
 * - There is no separate layout phase: `useIsoLayoutEffect` is the same function. Both run in the
 *   same flush as the DOM update, so before the browser paints.
 *
 * @example
 * useEffect(
 *   () => [open(), props.disabled],
 *   ([isOpen, disabled]) => {
 *     if (!isOpen || disabled) {
 *       return undefined;
 *     }
 *     return addEventListener(doc, 'keydown', onKeyDown);
 *   },
 * );
 */
export function useEffect<const Deps extends readonly unknown[]>(
  deps: () => Deps,
  effect: (deps: Deps) => Cleanup,
): void {
  const memoizedDeps = createMemo(deps, { equals: areDepsEqual });
  createEffect(memoizedDeps, (values) => {
    const cleanup = effect(values);
    return typeof cleanup === 'function' ? cleanup : undefined;
  });
}

/**
 * The Solid counterpart of `useIsoLayoutEffect(effect, deps)`. See `useEffect`.
 */
export const useIsoLayoutEffect = useEffect;

/**
 * Runs once, after the component is created and its elements are in the document.
 * May return a cleanup function that runs when the component is disposed.
 */
export function useOnMount(fn: () => Cleanup): void {
  onSettled(() => {
    const cleanup = fn();
    return typeof cleanup === 'function' ? cleanup : undefined;
  });
}
