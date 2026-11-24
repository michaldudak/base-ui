import type { Accessor } from 'solid-js';

/**
 * A value, or an accessor returning it.
 *
 * Hook parameters that a React hook would receive fresh on every render are typed with this, so a
 * caller can pass a reactive read (`() => props.disabled`) or a constant.
 */
export type MaybeAccessor<T> = T | Accessor<T>;

/**
 * Reads a `MaybeAccessor`. Call it where the value is used (in JSX, a memo, an effect's compute
 * function or an event handler), never once at the top of a component or hook.
 *
 * Do not use it for values that are functions themselves (callbacks): those are passed as they are.
 */
export function access<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as Accessor<T>)() : value;
}
