import { createMemo, onCleanup, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import { useExternalEffect, useIsoLayoutEffect } from '#utils/useEffect';
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
  const open = () => access(parameters.open);
  const mounted = () => access(parameters.mounted);
  const value = () => access(parameters.value);

  // The query the popup closed with, while it is closed and still mounted. It is derived state:
  // the memo captures the value in the pass where the popup closes, keeps it while the popup
  // animates out, and lets go once the popup has unmounted or opened again. (React keeps it in
  // state that an effect sets and clears.)
  const closeState = createMemo<{ open: boolean; query: string | null }>((previous) => {
    const isOpen = open();
    if (isOpen || !mounted()) {
      return { open: isOpen, query: null };
    }
    if (previous?.open) {
      // Captured once, on closing; a later change of the value doesn't replace it.
      const closingValue = untrack(value);
      return { open: false, query: closingValue !== '' ? closingValue : null };
    }
    return previous ?? { open: false, query: null };
  });

  // The value the unmount cleanup reads, which can't read accessors.
  const latest = { value: '' };
  useIsoLayoutEffect(
    () => [value()] as const,
    ([currentValue]) => {
      latest.value = currentValue;
    },
  );

  let pendingReset = false;

  const settlePendingReset = (currentValue: string) => {
    pendingReset = false;
    if (currentValue !== '') {
      parameters.onValueChange('', createChangeEventDetails(REASONS.popupClose));
    }
  };

  // Clears the committed value once the popup has unmounted, which follows its exit animation.
  // `value` is read when the effect runs, without being a dependency: the effect resets it.
  useExternalEffect(
    () => [open(), mounted(), untrack(value)] as const,
    ([isOpen, isMounted, currentValue], previous) => {
      // `useRef(open)`: the first run compares against the initial value.
      const wasOpen = previous ? previous[0] : isOpen;
      if (wasOpen && !isOpen && currentValue !== '') {
        pendingReset = true;
      }
      // A reopen that interrupts the exit never unmounts, so it settles the pending reset too.
      if ((isOpen || !isMounted) && pendingReset) {
        settlePendingReset(currentValue);
      }
    },
  );

  onCleanup(() => {
    if (pendingReset) {
      settlePendingReset(latest.value);
    }
  });

  return () => {
    const closeQuery = closeState().query;
    return !open() && closeQuery !== null ? closeQuery : value();
  };
}
