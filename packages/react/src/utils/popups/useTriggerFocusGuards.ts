'use client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { ownerDocument } from '@base-ui/utils/owner';
import {
  activeElement,
  contains,
  type FocusableElement,
  isOutsideEvent,
  tabbable,
} from '../../floating-ui-react/utils';
import {
  type BaseUIChangeEventDetails,
  createChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

/**
 * Minimal store interface required by the focus guard hook.
 * Both PopoverStore and MenuStore satisfy this interface.
 */
interface TriggerFocusGuardStore {
  setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails<typeof REASONS.focusOut>): void;
  select(key: 'positionerElement'): HTMLElement | null;
  select(key: 'open'): boolean;
  context: {
    readonly beforeContentFocusGuardRef: React.RefObject<HTMLElement | null>;
  };
}

/**
 * Provides focus guard handlers for popup triggers (Popover, Menu).
 *
 * Invisible focus guard elements are placed before and after the trigger while the popup is open.
 * These handlers close the popup and move focus to the appropriate tabbable element when a guard
 * receives focus (i.e. when the user tabs out). Popover keeps the guards connected but removes
 * them from sequential navigation during an exit animation so an already-dispatched native focus
 * event can still be completed without exposing the guards to subsequent Tab navigation.
 */
export function useTriggerFocusGuards(
  store: TriggerFocusGuardStore,
  triggerElementRef: React.RefObject<HTMLElement | null>,
) {
  const preFocusGuardRef = React.useRef<HTMLElement>(null);

  function focusOrRelease(
    element: FocusableElement | HTMLElement | null | undefined,
    guard: HTMLElement,
  ) {
    element?.focus();

    // At a document boundary there is no destination. Do not leave focus on the invisible guard.
    if (activeElement(ownerDocument(guard)) === guard) {
      guard.blur();
    }
  }

  function requestCloseAndMoveFocus(
    event: React.FocusEvent,
    guard: HTMLElement,
    destination: FocusableElement | null,
  ) {
    const eventDetails = createChangeEventDetails(REASONS.focusOut, event.nativeEvent, guard);
    ReactDOM.flushSync(() => {
      store.setOpen(false, eventDetails);
    });

    // Native Tab has already crossed the guard, so complete the move even if the consumer keeps
    // the popup open by canceling the close request.
    focusOrRelease(destination, guard);
  }

  function getOutsideTabbable(
    referenceElement: Element | null,
    direction: -1 | 1,
    positionerElement: HTMLElement | null,
  ) {
    if (!referenceElement) {
      return null;
    }

    const tabbableElements = tabbable(ownerDocument(referenceElement).body);
    const referenceIndex = tabbableElements.indexOf(referenceElement as FocusableElement);
    if (referenceIndex === -1) {
      return null;
    }

    // Capture the browser's intended destination before requesting close. Internal focus guards
    // and popup descendants can still be tabbable at this point, but they are routing machinery,
    // not destinations. Using one snapshot also keeps the result stable when a close is canceled
    // or React temporarily detaches refs while committing the closed state.
    for (
      let candidateIndex = referenceIndex + direction;
      candidateIndex >= 0 && candidateIndex < tabbableElements.length;
      candidateIndex += direction
    ) {
      const candidate = tabbableElements[candidateIndex];
      if (
        !candidate.hasAttribute('data-base-ui-focus-guard') &&
        !contains(positionerElement, candidate)
      ) {
        return candidate;
      }
    }

    return null;
  }

  function handlePreFocusGuardFocus(event: React.FocusEvent) {
    const guard = event.currentTarget as HTMLElement;
    const isOpen = store.select('open');
    const relatedTarget = event.relatedTarget as Element | null;
    const positionerElement = store.select('positionerElement');
    const previousTabbable = getOutsideTabbable(
      isOpen ? guard : (relatedTarget ?? triggerElementRef.current),
      -1,
      positionerElement,
    );

    // Focus can already be moving to this guard when focusout closes the popup. The guard remains
    // connected for that event but is no longer tabbable; finish the pending backward move without
    // emitting a second close.
    if (!isOpen) {
      focusOrRelease(previousTabbable, guard);
      return;
    }

    requestCloseAndMoveFocus(event, guard, previousTabbable);
  }

  function handleFocusTargetFocus(event: React.FocusEvent) {
    const positionerElement = store.select('positionerElement');
    const guard = event.currentTarget as HTMLElement;

    // Focus can already be moving to this guard when focusout closes the popup. A closed popup is
    // never a destination, so finish that move outward before considering a redirect into it.
    // Subsequent Tab navigation skips this guard because its tabIndex is now -1.
    if (!store.select('open')) {
      focusOrRelease(getOutsideTabbable(triggerElementRef.current, 1, positionerElement), guard);
      return;
    }

    // Arriving from outside the positioner while open means the user tabbed backwards past the
    // trigger and should wrap into the popup instead of leaving it behind.
    if (positionerElement && isOutsideEvent(event, positionerElement)) {
      store.context.beforeContentFocusGuardRef.current?.focus();
      return;
    }

    // Anchor on the guard rather than the trigger, mirroring the backward direction. The guard is
    // always in the tab order while the popup is open, whereas the trigger may have left it — a
    // disabled trigger is dropped by `tabbable()`, which would resolve to no destination at all.
    const nextTabbable = getOutsideTabbable(guard, 1, positionerElement);

    requestCloseAndMoveFocus(event, guard, nextTabbable);
  }

  return { preFocusGuardRef, handlePreFocusGuardFocus, handleFocusTargetFocus };
}
