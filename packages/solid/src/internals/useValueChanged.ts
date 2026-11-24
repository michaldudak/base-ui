import { untrack } from 'solid-js';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useIsoLayoutEffect } from '#utils/useEffect';

export function useValueChanged<T>(value: MaybeAccessor<T>, onChange: (previousValue: T) => void) {
  // Initial value, read once on purpose: the effect below keeps it current.
  const valueRef = { current: untrack(() => access(value)) };

  useIsoLayoutEffect(
    () => [access(value)] as const,
    ([currentValue]) => {
      if (valueRef.current !== currentValue) {
        onChange(valueRef.current);
      }

      valueRef.current = currentValue;
    },
  );
}
