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
 * **An effect is for side effects, not for keeping state in sync.** If `effect` only computes a
 * value from `deps` and stores it, that value is derived state: use a memo, a derived store key
 * (`store.useSyncedValue`), or `createSignal(() => initial)` when it must also be writable. If a
 * value has to be reset when something else changes, reset it where that something is written.
 * Solid's development diagnostics (`EFFECT_RELAY_TEAR`, `EFFECT_WRITES_OWN_SOURCE`) flag both, and
 * the test setup fails on them. An effect may write state when it reports something read from
 * outside the reactive graph (a DOM measurement, a registration): use `useExternalEffect`.
 *
 * Differences from React to keep in mind:
 * - Effects of a parent run before the effects of its children (React runs children first).
 * - Effects of one component do not run in the order they are declared. Solid runs them in the
 *   order their `deps` settle, and `deps` that go through more memos settle later. An effect must
 *   not rely on another effect having run first. In particular, the React idiom of a last effect
 *   that stores "the previous value" in a ref for the effects above it does not work: take the
 *   previous values from the effect's second argument instead.
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
  effect: (deps: Deps, previousDeps: Deps | undefined) => Cleanup,
): void {
  const memoizedDeps = createMemo(deps, { equals: areDepsEqual });
  createEffect(memoizedDeps, (values, previousValues) => {
    const cleanup = effect(values, previousValues);
    return typeof cleanup === 'function' ? cleanup : undefined;
  });
}

/**
 * `useEffect` for an effect that talks to something outside the reactive graph and writes state
 * as a result: it measures the DOM, registers an element, waits for an animation to finish, or
 * publishes to an event bus whose listeners write state.
 *
 * What such an effect writes is not computed from `deps`, so it can't be a memo, and state that
 * depends on it settles one pass after the change that made the effect run. That is the cost of
 * leaving the graph. Solid's diagnostics tell these effects apart from state synchronization by
 * the callback taking no argument, so the values reach `effect` another way here.
 *
 * `deps` must not depend on anything the effect writes.
 */
export function useExternalEffect<const Deps extends readonly unknown[]>(
  deps: () => Deps,
  effect: (deps: Deps, previousDeps: Deps | undefined) => Cleanup,
): void {
  const memoizedDeps = createMemo(deps, { equals: areDepsEqual });
  let values: Deps;
  let previousValues: Deps | undefined;
  createEffect(
    () => {
      const nextValues = memoizedDeps();
      if (nextValues !== values) {
        previousValues = values;
        values = nextValues;
      }
      return nextValues;
    },
    () => {
      const cleanup = effect(values, previousValues);
      return typeof cleanup === 'function' ? cleanup : undefined;
    },
  );
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
