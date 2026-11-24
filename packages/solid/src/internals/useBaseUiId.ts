import type { Accessor } from 'solid-js';
import { useId } from '#utils/useId';

/**
 * Wraps `useId` and prefixes generated `id`s with `base-ui-`.
 * Returns an accessor so that a reactive override (usually `() => props.id`) wins when set.
 * @param idOverride overrides the generated id when it returns a value
 */
export function useBaseUiId(idOverride?: Accessor<string | undefined>): Accessor<string> {
  const generatedId = useId('base-ui');
  return idOverride ? () => idOverride() ?? generatedId : () => generatedId;
}
