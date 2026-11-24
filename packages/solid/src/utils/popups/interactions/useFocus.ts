import { createMemo } from 'solid-js';
import { addEventListener } from '#utils/addEventListener';
import { platform } from '#utils/platform';
import { mergeCleanups } from '#utils/mergeCleanups';
import { ownerDocument } from '#utils/owner';
import { useTimeout } from '#utils/useTimeout';
import { useEffect } from '#utils/useEffect';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { EMPTY_OBJECT } from '#utils/empty';
import { activeElement, contains, getTarget } from '#utils/shadowDom';
import { getWindow, isElement, isHTMLElement } from '@floating-ui/utils/dom';
import type { ElementProps, PopupInteractionStore } from '../types';
import { createAttribute } from '../createAttribute';
import { isTargetInsideEnabledTrigger, isTypeableElement, matchesFocusVisible } from '../element';
import { createChangeEventDetails } from '../../../internals/createBaseUIEventDetails';
import { REASONS } from '../../../internals/reasons';
import type { FloatingUIOpenChangeDetails, HTMLProps } from '../../../internals/types';

const isMacSafari = platform.os.mac && platform.engine.webkit;

export interface UseFocusProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined>;
  /**
   * Waits for the specified time before opening.
   * @default undefined
   */
  delay?: MaybeAccessor<number | undefined>;
}

/**
 * Opens the floating element while the reference element has focus, like CSS
 * `:focus`.
 * @see https://floating-ui.com/docs/useFocus
 */
export function useFocus(store: PopupInteractionStore, props: UseFocusProps = {}): ElementProps {
  const isEnabled = () => access(props.enabled) ?? true;

  const storeContext = store.context;
  const { events } = storeContext;

  const blockFocusRef = { current: false };
  // Track which reference should be blocked from re-opening after Escape/press dismissal.
  const blockedReferenceRef = { current: null as Element | null };
  const keyboardModalityRef = { current: true };

  const timeout = useTimeout();

  useEffect(
    () => [isEnabled()] as const,
    ([enabled]) => {
      const domReference = store.select('anchorElement');

      if (!enabled) {
        return undefined;
      }

      const win = getWindow(domReference);

      // If the reference was focused and the user left the tab/window, and the
      // floating element was not open, the focus should be blocked when they
      // return to the tab/window.
      function onBlur() {
        const currentDomReference = store.select('anchorElement');
        if (
          !store.select('open') &&
          isHTMLElement(currentDomReference) &&
          currentDomReference === activeElement(ownerDocument(currentDomReference))
        ) {
          blockFocusRef.current = true;
          blockedReferenceRef.current = currentDomReference;
        }
      }

      function onKeyDown() {
        keyboardModalityRef.current = true;
      }

      function onPointerDown() {
        keyboardModalityRef.current = false;
      }

      return mergeCleanups(
        addEventListener(win, 'blur', onBlur),
        isMacSafari && addEventListener(win, 'keydown', onKeyDown, true),
        isMacSafari && addEventListener(win, 'pointerdown', onPointerDown, true),
      );
    },
  );

  useEffect(
    () => [events, isEnabled()] as const,
    ([emitter, enabled]) => {
      if (!enabled) {
        return undefined;
      }

      function onOpenChangeLocal(details: FloatingUIOpenChangeDetails) {
        if (details.reason === REASONS.triggerPress || details.reason === REASONS.escapeKey) {
          const referenceElement = store.select('anchorElement');
          if (isElement(referenceElement)) {
            blockedReferenceRef.current = referenceElement;
            blockFocusRef.current = true;
          }
        }
      }

      emitter.on('openchange', onOpenChangeLocal);
      return () => {
        emitter.off('openchange', onOpenChangeLocal);
      };
    },
  );

  function resetBlockedFocus() {
    blockFocusRef.current = false;
    blockedReferenceRef.current = null;
  }

  const handlers: HTMLProps = {
    onMouseLeave() {
      resetBlockedFocus();
    },
    onFocus(event: FocusEvent) {
      const focusTarget = event.currentTarget as Element;

      if (blockFocusRef.current) {
        if (blockedReferenceRef.current === focusTarget) {
          return;
        }

        resetBlockedFocus();
      }

      const target = getTarget(event);

      if (isElement(target)) {
        // Safari fails to match `:focus-visible` if focus was initially
        // outside the document.
        if (isMacSafari && !event.relatedTarget) {
          if (!keyboardModalityRef.current && !isTypeableElement(target)) {
            return;
          }
        } else if (!matchesFocusVisible(target)) {
          return;
        }
      }

      const movedFromOtherEnabledTrigger = isTargetInsideEnabledTrigger(
        event.relatedTarget,
        store.context.triggerElements,
      );

      const nativeEvent = event;
      const currentTarget = event.currentTarget;
      const delay = access(props.delay);

      if ((store.select('open') && movedFromOtherEnabledTrigger) || !delay) {
        store.setOpen(
          true,
          createChangeEventDetails(REASONS.triggerFocus, nativeEvent, currentTarget as HTMLElement),
        );
        return;
      }

      timeout.start(delay, () => {
        if (blockFocusRef.current) {
          return;
        }

        store.setOpen(
          true,
          createChangeEventDetails(REASONS.triggerFocus, nativeEvent, currentTarget as HTMLElement),
        );
      });
    },
    onBlur(event: FocusEvent) {
      resetBlockedFocus();

      const relatedTarget = event.relatedTarget;
      const nativeEvent = event;

      // Hit the non-modal focus management portal guard. Focus will be
      // moved into the floating element immediately after.
      const movedToFocusGuard =
        isElement(relatedTarget) &&
        relatedTarget.hasAttribute(createAttribute('focus-guard')) &&
        relatedTarget.getAttribute('data-type') === 'outside';

      // Wait for the window blur listener to fire.
      timeout.start(0, () => {
        const domReference = store.select('anchorElement');
        const activeEl = activeElement(ownerDocument(domReference));

        // Focus left the page, keep it open.
        if (!relatedTarget && activeEl === domReference) {
          return;
        }

        // When focusing the reference element (e.g. regular click), then
        // clicking into the floating element, prevent it from hiding.
        // Note: it must be focusable, e.g. `tabindex="-1"`.
        // We can not rely on relatedTarget to point to the correct element
        // as it will only point to the shadow host of the newly focused element
        // and not the element that actually has received focus if it is located
        // inside a shadow root.
        if (
          contains(storeContext.positioning?.refs.floating.current, activeEl) ||
          contains(domReference, activeEl) ||
          movedToFocusGuard
        ) {
          return;
        }

        // If the next focused element is one of the triggers, do not close
        // the floating element. The focus handler of that trigger will
        // handle the open state.
        const nextFocusedElement = relatedTarget ?? activeEl;
        if (isTargetInsideEnabledTrigger(nextFocusedElement, store.context.triggerElements)) {
          return;
        }

        store.setOpen(false, createChangeEventDetails(REASONS.triggerFocus, nativeEvent));
      });
    },
  };

  const reference = createMemo<HTMLProps>(() => (isEnabled() ? handlers : EMPTY_OBJECT));

  return { reference, trigger: reference };
}
