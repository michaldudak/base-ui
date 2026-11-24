import { mergePropsN } from './mergeProps';
import type { InputProps } from './mergeProps';
import type { HTMLProps } from '../internals/types';

export * from './mergeProps';

/**
 * Merges multiple sets of props, like `mergeProps` of `@base-ui/react`.
 *
 * Solid port: `children` is a getter that creates the child elements when read, so the merge
 * never reads it. The result forwards the rightmost `children` as a getter instead, and the
 * elements are created where the merged props are rendered:
 * `render={(props) => <div {...mergeProps(props, { class: 'mine' })} />}`.
 * Library code imports the internal version from `./mergeProps`, which leaves `children` out.
 */
export function mergeProps(...props: InputProps[]): HTMLProps {
  const merged = mergePropsN(props);
  for (let i = props.length - 1; i >= 0; i -= 1) {
    const source = props[i];
    if (source != null && typeof source !== 'function' && 'children' in source) {
      const result = merged === props[i] || Object.isFrozen(merged) ? { ...merged } : merged;
      Object.defineProperty(result, 'children', {
        get: () => (source as { children?: unknown }).children,
        enumerable: true,
        configurable: true,
      });
      return result;
    }
  }
  return merged;
}
