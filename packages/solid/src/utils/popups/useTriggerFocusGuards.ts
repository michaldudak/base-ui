import { flush } from 'solid-js';
import { getTabbableNearElement, isOutsideEvent } from './focus/tabbable';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

type GuardFocusEvent = FocusEvent & { currentTarget: HTMLElement };

/**
 * Minimal store interface required by the focus guard hook.
 * Both PopoverStore and MenuStore satisfy this interface.
 */
interface TriggerFocusGuardStore {
  setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails<typeof REASONS.focusOut>): void;
  select(key: 'positionerElement'): HTMLElement | null;
  context: {
    /**
     * Shared with the focus manager through `getInsideElements` so that blurring the trigger
     * onto this guard does not close the popup before the guard's own focus handler runs.
     */
    readonly beforeTriggerFocusGuardRef: { current: HTMLElement | null };
    readonly beforeContentFocusGuardRef: { current: HTMLElement | null };
    readonly triggerFocusTargetRef: { current: HTMLElement | null };
  };
}

/**
 * Provides focus guard handlers for popup triggers (Popover, Menu).
 *
 * When the popup is open, invisible focus guard elements are placed before and after
 * the trigger. These handlers close the popup and move focus to the appropriate
 * tabbable element when the guards receive focus (i.e. when the user tabs out).
 */
export function useTriggerFocusGuards(
  store: TriggerFocusGuardStore,
  triggerElementRef: { current: HTMLElement | null },
) {
  function closeAndFocus(
    event: GuardFocusEvent,
    direction: 1 | -1,
    positionerElement: HTMLElement | null,
  ) {
    const guard = event.currentTarget;

    store.setOpen(false, createChangeEventDetails(REASONS.focusOut, event, guard));
    flush();

    // The close callback may change the tab order. Resolve it after the flush, using
    // the trigger as the anchor if the guard unmounted, even when its tabIndex is -1.
    getTabbableNearElement(
      guard.isConnected ? guard : triggerElementRef.current,
      direction,
      positionerElement,
    )?.focus();
  }

  function handlePreFocusGuardFocus(event: GuardFocusEvent) {
    closeAndFocus(event, -1, store.select('positionerElement'));
  }

  function handleFocusTargetFocus(event: GuardFocusEvent) {
    const positionerElement = store.select('positionerElement');
    if (positionerElement && isOutsideEvent(event, positionerElement)) {
      store.context.beforeContentFocusGuardRef.current?.focus();
    } else {
      closeAndFocus(event, 1, positionerElement);
    }
  }

  return { handlePreFocusGuardFocus, handleFocusTargetFocus };
}
