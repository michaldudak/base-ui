import { createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { useIsoLayoutEffect } from '#utils/useEffect';
import type { MaybeAccessor } from '#utils/access';
import { access } from '#utils/access';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { FilterDropdownRoot } from './FilterDropdownRootContext';

interface UseFilterDropdownCloseQueryParameters {
  open: MaybeAccessor<boolean>;
  mounted: MaybeAccessor<boolean>;
  value: MaybeAccessor<string>;
  onValueChange: (value: string, details: FilterDropdownRoot.ChangeEventDetails) => void;
}

/**
 * Retains the displayed query and filtered items while a filter popup closes, and clears the
 * committed value once it has unmounted. The input lives inside the popup, so the value stays in
 * use until then: clearing it earlier would change whatever the consumer renders from it, such
 * as externally filtered items, while the popup animates out.
 */
export function useFilterDropdownCloseQuery(
  parameters: UseFilterDropdownCloseQueryParameters,
): Accessor<string> {
  const [closeQuery, setCloseQuery] = createSignal<string | null>(null, { ownedWrite: true });

  // Solid port: the latest committed values, read where React read the latest render's values
  // (the stable callback below and the unmount cleanup), which can't read accessors.
  const latest = { value: '' };
  let initialized = false;

  const previousOpenRef = { current: false };
  const pendingResetRef = { current: false };

  const settlePendingReset = () => {
    pendingResetRef.current = false;
    if (latest.value !== '') {
      parameters.onValueChange('', createChangeEventDetails(REASONS.popupClose));
    }
  };

  useIsoLayoutEffect(
    () =>
      [
        access(parameters.open),
        access(parameters.mounted),
        access(parameters.value),
        closeQuery(),
      ] as const,
    ([open, mounted, value, currentCloseQuery]) => {
      latest.value = value;
      if (!initialized) {
        // `useRef(open)`: the first run compares against the initial value.
        initialized = true;
        previousOpenRef.current = open;
      }
      const wasOpen = previousOpenRef.current;
      previousOpenRef.current = open;
      if (wasOpen && !open && value !== '') {
        pendingResetRef.current = true;
        setCloseQuery(value);
      } else if ((open || !mounted) && currentCloseQuery !== null) {
        // A reopen that interrupts the exit never unmounts, so it settles the pending reset too.
        setCloseQuery(null);
        settlePendingReset();
      }
    },
  );

  onCleanup(() => {
    if (pendingResetRef.current) {
      settlePendingReset();
    }
  });

  return () => {
    const currentCloseQuery = closeQuery();
    return !access(parameters.open) && currentCloseQuery !== null
      ? currentCloseQuery
      : access(parameters.value);
  };
}
