import { createMemo } from 'solid-js';
import { useAnimationFrame } from '#utils/useAnimationFrame';
import { useTimeout } from '#utils/useTimeout';
import { EMPTY_OBJECT } from '#utils/empty';
import { getTarget } from '#utils/shadowDom';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import type { ElementProps, PopupInteractionStore } from '../types';
import type { HTMLProps } from '../../../internals/types';
import { isTypeableElement } from '../element';
import { isMouseLikePointerType, isVirtualPointerEvent } from '../event';
import { createChangeEventDetails } from '../../../internals/createBaseUIEventDetails';
import { REASONS } from '../../../internals/reasons';

export interface UseClickProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined>;
  /**
   * The type of event to use to determine a “click” with mouse input.
   * Keyboard clicks work as normal.
   * @default 'click'
   */
  event?: MaybeAccessor<'click' | 'mousedown' | 'mousedown-only' | undefined>;
  /**
   * Whether to toggle the open state with repeated clicks.
   * @default true
   */
  toggle?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether to ignore the logic for mouse input (for example, if `useHover()`
   * is also being used).
   * @default false
   */
  ignoreMouse?: MaybeAccessor<boolean | undefined>;
  /**
   * If already open from another event such as the `useHover()` Hook,
   * determines whether to keep the floating element open when clicking the
   * reference element for the first time. A getter is read when the press is handled.
   * @default true
   */
  stickIfOpen?: boolean | (() => boolean) | undefined;
  /**
   * Touch-only delay (ms) before opening. Useful to allow mobile viewport/keyboard to settle.
   * @default 0
   */
  touchOpenDelay?: MaybeAccessor<number | undefined>;
  /**
   * The reason for the click.
   * @default REASONS.triggerPress
   */
  reason?: MaybeAccessor<typeof REASONS.triggerPress | typeof REASONS.inputPress | undefined>;
}

/**
 * Opens or closes the floating element when clicking the reference element.
 * @see https://floating-ui.com/docs/useClick
 */
export function useClick(store: PopupInteractionStore, props: UseClickProps = {}): ElementProps {
  const isEnabled = () => access(props.enabled) ?? true;
  const getEventOption = () => access(props.event) ?? 'click';
  const getToggle = () => access(props.toggle) ?? true;
  const getIgnoreMouse = () => access(props.ignoreMouse) ?? false;
  const getStickIfOpen = () => props.stickIfOpen ?? true;
  const getTouchOpenDelay = () => access(props.touchOpenDelay) ?? 0;
  const getReason = () => access(props.reason) ?? REASONS.triggerPress;

  const storeContext = store.context;

  // `PointerEvent['pointerType']` is a `string` in the DOM types ('mouse' | 'pen' | 'touch').
  const pointerTypeRef = {
    current: undefined as PointerEvent['pointerType'] | 'virtual' | undefined,
  };
  const frame = useAnimationFrame();
  const touchOpenTimeout = useTimeout();

  function setOpenWithTouchDelay(
    nextOpen: boolean,
    nativeEvent: MouseEvent,
    target: HTMLElement,
    pointerType: PointerEvent['pointerType'] | 'virtual' | undefined,
  ) {
    const details = createChangeEventDetails(getReason(), nativeEvent, target);
    const touchOpenDelay = getTouchOpenDelay();

    if (nextOpen && pointerType === 'touch' && touchOpenDelay > 0) {
      touchOpenTimeout.start(touchOpenDelay, () => {
        store.setOpen(true, details);
      });
    } else {
      store.setOpen(nextOpen, details);
    }
  }

  function getNextOpen(
    open: boolean,
    currentTarget: EventTarget | null,
    isClickLikeOpenEvent: (eventType: string | undefined) => boolean,
  ) {
    const openEvent = storeContext.openEvent;
    const hasClickedOnInactiveTrigger = store.select('anchorElement') !== currentTarget;

    if (open && hasClickedOnInactiveTrigger) {
      // Moving between triggers should always open the newly active one.
      return true;
    }

    if (!open) {
      // A closed popup should open on the next press.
      return true;
    }

    if (!getToggle()) {
      // Non-toggle mode never closes on a repeated trigger press.
      return true;
    }

    const stickIfOpen = getStickIfOpen();
    if (openEvent && (typeof stickIfOpen === 'function' ? stickIfOpen() : stickIfOpen)) {
      // Preserve hover/focus-opened popups until the matching click-like event closes them.
      return !isClickLikeOpenEvent(openEvent.type);
    }

    // Otherwise, a repeated click toggles the popup closed.
    return false;
  }

  const handlers: HTMLProps = {
    onPointerDown(event: PointerEvent) {
      // Screen reader activations (Android TalkBack, desktop screen readers) report a
      // mouse-like `pointerType`, but `ignoreMouse` must not drop them: hover logic cannot
      // open for a virtual press since there is no real pointer movement to wait for.
      // Virtual `touch` presses (iOS VoiceOver) keep their type so `touchOpenDelay` applies.
      pointerTypeRef.current =
        isMouseLikePointerType(event.pointerType, true) && isVirtualPointerEvent(event)
          ? 'virtual'
          : event.pointerType;
    },
    onMouseDown(event: MouseEvent) {
      const pointerType = pointerTypeRef.current;
      const nativeEvent = event;
      const open = store.select('open');

      // Ignore all buttons except for the "main" button.
      // https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
      if (
        event.button !== 0 ||
        getEventOption() === 'click' ||
        (isMouseLikePointerType(pointerType, true) && getIgnoreMouse())
      ) {
        return;
      }

      const nextOpen = getNextOpen(
        open,
        event.currentTarget,
        (openEventType) => openEventType === 'click' || openEventType === 'mousedown',
      );

      // Animations sometimes won't run on a typeable element if using a rAF.
      // Focus is always set on these elements. For touch, we may delay opening.
      // A screen reader press opens synchronously, so the popup's focus lands before the reader
      // re-syncs focus to its cursor, which would otherwise read as a stray move.
      const target = getTarget(nativeEvent);
      const isTypeable = isTypeableElement(target);

      if (isTypeable || pointerType === 'virtual') {
        // A virtual press may target a descendant of the trigger; the trigger is what opened.
        const pressedElement = (isTypeable ? target : event.currentTarget) as HTMLElement;

        // The reader only moves focus to its cursor after the press, so focus the trigger first.
        // Otherwise the popup records the previously focused element as where focus returns.
        // Like the browser's own mousedown focus, skip it when the default was prevented.
        if (!open && !isTypeable && !event.defaultPrevented) {
          pressedElement.focus({ preventScroll: true });
        }

        setOpenWithTouchDelay(nextOpen, nativeEvent, pressedElement, pointerType);
        return;
      }

      // Capture the currentTarget before the rAF.
      // as React sets it to null after the event handler completes.
      const eventCurrentTarget = event.currentTarget as HTMLElement;

      // Wait until focus is set on the element. This is an alternative to
      // `event.preventDefault()` to avoid :focus-visible from appearing when using a pointer.
      frame.request(() => {
        setOpenWithTouchDelay(nextOpen, nativeEvent, eventCurrentTarget, pointerType);
      });
    },
    onClick(event: MouseEvent) {
      const eventOption = getEventOption();

      if (eventOption === 'mousedown-only') {
        return;
      }

      const pointerType = pointerTypeRef.current;

      if (eventOption === 'mousedown' && pointerType) {
        pointerTypeRef.current = undefined;
        return;
      }

      if (isMouseLikePointerType(pointerType, true) && getIgnoreMouse()) {
        return;
      }

      const open = store.select('open');
      const nextOpen = getNextOpen(
        open,
        event.currentTarget,
        (openEventType) =>
          openEventType === 'click' ||
          openEventType === 'mousedown' ||
          openEventType === 'keydown' ||
          openEventType === 'keyup',
      );
      setOpenWithTouchDelay(nextOpen, event, event.currentTarget as HTMLElement, pointerType);
    },
    onKeyDown() {
      pointerTypeRef.current = undefined;
    },
  };

  const reference = createMemo<HTMLProps>(() => (isEnabled() ? handlers : EMPTY_OBJECT));

  return { reference };
}
