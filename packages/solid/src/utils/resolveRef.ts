/**
 * If the provided argument is a ref object, returns its `current` value.
 * Otherwise, returns the argument itself.
 */
export function resolveRef<T extends HTMLElement | null | undefined>(
  maybeRef: T | { current: T },
): T {
  if (maybeRef == null) {
    return maybeRef;
  }

  return 'current' in maybeRef ? maybeRef.current : maybeRef;
}
