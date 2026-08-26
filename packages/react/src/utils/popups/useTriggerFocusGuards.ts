'use client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { ownerDocument } from '@base-ui/utils/owner';
import {
  activeElement,
  collectTabbableFrom,
  contains,
  createTabOrderSnapshot,
  type FocusableElement,
  isOutsideEvent,
  isTabbable,
  type TabOrderSnapshot,
} from '../../floating-ui-react/utils';
import {
  type BaseUIChangeEventDetails,
  createChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

const FOCUS_GUARD_ATTRIBUTE = 'data-base-ui-focus-guard';

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
 * event can still be completed without exposing the guards to subsequent Tab navigation; Menu
 * unmounts its guards at close instead, which is why the trigger stays available as a fallback
 * reference point below.
 */
export function useTriggerFocusGuards(
  store: TriggerFocusGuardStore,
  triggerElementRef: React.RefObject<HTMLElement | null>,
) {
  const preFocusGuardRef = React.useRef<HTMLElement>(null);

  function collectDestinations(
    snapshot: TabOrderSnapshot,
    anchor: Element | null,
    direction: -1 | 1,
    positionerElement: HTMLElement | null,
  ) {
    // Internal focus guards and popup descendants can be tabbable at this point, but they are
    // routing machinery, not destinations.
    return collectTabbableFrom(
      snapshot,
      anchor,
      direction,
      (element) =>
        !element.hasAttribute(FOCUS_GUARD_ATTRIBUTE) && !contains(positionerElement, element),
    );
  }

  function resolveDestinations(
    anchor: Element | null,
    direction: -1 | 1,
    positionerElement: HTMLElement | null,
  ) {
    if (!anchor) {
      return [];
    }

    const snapshot = createTabOrderSnapshot(ownerDocument(anchor).body, [anchor]);
    return collectDestinations(snapshot, anchor, direction, positionerElement);
  }

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

  /**
   * Destinations are resolved before the close so the browser's intended target survives a close
   * the consumer cancels, and React temporarily detaching refs while it commits. The close itself
   * can still invalidate that target, so it is revalidated afterwards and the walk repeats against
   * the committed DOM when it did not survive — that is what lets a node the consumer swapped in
   * during `onOpenChange` become the destination.
   */
  function moveFocusOut(
    guard: HTMLElement,
    destinations: FocusableElement[],
    direction: -1 | 1,
    positionerElement: HTMLElement | null,
  ) {
    const intended = destinations[0];
    if (intended && intended.isConnected && isTabbable(intended)) {
      focusOrRelease(intended, guard);
      return;
    }

    // Popover keeps its guards connected through the exit animation, so the guard remains the
    // truest reference point. Menu unmounts them at close; the trigger stands in there, and the
    // traversal can still locate it even when the close left it out of the tab order.
    const anchor = guard.isConnected ? guard : triggerElementRef.current;
    const surviving = destinations.find((element) => element.isConnected && isTabbable(element));

    focusOrRelease(
      resolveDestinations(anchor, direction, positionerElement)[0] ?? surviving ?? null,
      guard,
    );
  }

  function requestCloseAndMoveFocus(
    event: React.FocusEvent,
    guard: HTMLElement,
    destinations: FocusableElement[],
    direction: -1 | 1,
    positionerElement: HTMLElement | null,
  ) {
    const eventDetails = createChangeEventDetails(REASONS.focusOut, event.nativeEvent, guard);
    ReactDOM.flushSync(() => {
      store.setOpen(false, eventDetails);
    });

    // Native Tab has already crossed the guard, so complete the move even if the consumer keeps
    // the popup open by canceling the close request.
    moveFocusOut(guard, destinations, direction, positionerElement);
  }

  /**
   * A guard that is no longer tabbable can still receive a native focus event dispatched while it
   * was. `relatedTarget` is the only record of which way that move was heading — but only when it
   * sits outside the popup. The popup is portalled after the trigger, so a `relatedTarget` inside
   * it describes where the portal lives rather than where the user was going, and the handler's
   * own direction is the better answer.
   */
  function resolveDirection(
    snapshot: TabOrderSnapshot,
    guard: HTMLElement,
    relatedTarget: Element | null,
    positionerElement: HTMLElement | null,
    fallback: -1 | 1,
  ): -1 | 1 {
    if (!relatedTarget || contains(positionerElement, relatedTarget)) {
      return fallback;
    }

    const guardPosition = snapshot.positionOf(guard);
    const relatedPosition = snapshot.positionOf(relatedTarget);
    if (guardPosition === -1 || relatedPosition === -1 || guardPosition === relatedPosition) {
      return fallback;
    }

    return relatedPosition < guardPosition ? 1 : -1;
  }

  /**
   * Focus can already be moving to a guard when a focus-out closes the popup. The guard stays
   * connected for that event but is no longer tabbable, so the pending move is completed without
   * emitting a second close. Subsequent Tab navigation skips the guard entirely.
   */
  function completeInFlightMove(
    event: React.FocusEvent,
    guard: HTMLElement,
    positionerElement: HTMLElement | null,
    fallbackDirection: -1 | 1,
  ) {
    const relatedTarget = event.relatedTarget as Element | null;
    const snapshot = createTabOrderSnapshot(ownerDocument(guard).body, [guard, relatedTarget]);
    const direction = resolveDirection(
      snapshot,
      guard,
      relatedTarget,
      positionerElement,
      fallbackDirection,
    );

    focusOrRelease(
      collectDestinations(snapshot, guard, direction, positionerElement)[0] ?? null,
      guard,
    );
  }

  function handlePreFocusGuardFocus(event: React.FocusEvent) {
    const guard = event.currentTarget as HTMLElement;
    const positionerElement = store.select('positionerElement');

    if (!store.select('open')) {
      completeInFlightMove(event, guard, positionerElement, -1);
      return;
    }

    requestCloseAndMoveFocus(
      event,
      guard,
      resolveDestinations(guard, -1, positionerElement),
      -1,
      positionerElement,
    );
  }

  function handleFocusTargetFocus(event: React.FocusEvent) {
    const guard = event.currentTarget as HTMLElement;
    const positionerElement = store.select('positionerElement');

    if (!store.select('open')) {
      completeInFlightMove(event, guard, positionerElement, 1);
      return;
    }

    // Arriving from outside the positioner while open means the user tabbed backwards past the
    // trigger and should wrap into the popup instead of leaving it behind.
    if (positionerElement && isOutsideEvent(event, positionerElement)) {
      store.context.beforeContentFocusGuardRef.current?.focus();
      return;
    }

    // Anchor on the guard rather than the trigger, mirroring the backward direction. The guard is
    // always in the tab order while the popup is open, whereas the trigger may have left it.
    requestCloseAndMoveFocus(
      event,
      guard,
      resolveDestinations(guard, 1, positionerElement),
      1,
      positionerElement,
    );
  }

  return { preFocusGuardRef, handlePreFocusGuardFocus, handleFocusTargetFocus };
}
