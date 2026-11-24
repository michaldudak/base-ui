import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import { useIsoLayoutEffect } from '#utils/useEffect';

interface ResolveRenderedIdProps {
  id?: string | undefined;
  render?: unknown;
}

/**
 * Resolves an element's id using the same precedence as `useRenderElement`.
 * Returns `''` when the element renders with an explicitly empty id, which consumers must treat
 * as "no id" rather than falling back to the generated one, so ARIA relationships never reference
 * an id no element carries. Render callbacks are opaque and are expected to use the id passed to
 * them.
 *
 * Solid port: the `render` prop has no element form, so only the `id` prop can override the
 * fallback.
 */
export function resolveRenderedId(props: ResolveRenderedIdProps, fallbackId: string | undefined) {
  return props.id ?? fallbackId;
}

/**
 * Resolves the element's id and returns a ref that publishes it to the owner while mounted.
 * A generated fallback is never published as an override, so removing an explicit id lets the
 * element return to the generated one.
 *
 * Solid port: returns an accessor for the id. The ref only records the element; the id is
 * published from an effect (after the element is inserted) and again whenever it changes, and
 * withdrawn when the element is removed.
 */
export function useRenderedId(
  props: ResolveRenderedIdProps,
  defaultId: Accessor<string | undefined>,
  setId: ((id: string | undefined) => void) | undefined,
) {
  const id = createMemo(() => resolveRenderedId(props, defaultId()));
  const registeredId = createMemo(() => {
    const currentId = id();
    return currentId === defaultId() ? undefined : currentId;
  });

  let element: HTMLElement | null = null;
  const ref = (node: HTMLElement) => {
    element = node;
  };

  useIsoLayoutEffect(
    () => [registeredId()] as const,
    ([currentRegisteredId]) => {
      if (element === null) {
        return undefined;
      }
      setId?.(currentRegisteredId);
      return () => {
        setId?.(undefined);
      };
    },
  );

  return [id, ref] as const;
}
