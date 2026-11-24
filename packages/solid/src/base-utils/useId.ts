import { createUniqueId } from 'solid-js';

/**
 * Generates a unique id that is stable across server rendering and hydration.
 * Call it once in a component's body.
 *
 * @param prefix prefixes the generated id when provided
 */
export function useId(prefix?: string): string {
  const id = createUniqueId();
  return prefix ? `${prefix}-${id}` : id;
}
