import type { Accessor } from 'solid-js';
import { isElement, isHTMLElement } from '@floating-ui/utils/dom';
import { ownerDocument } from '#utils/owner';
import { warn } from '#utils/warn';
import { activeElement, contains, getTarget } from '#utils/shadowDom';
import { useEffect } from '#utils/useEffect';
import type { MaybeAccessor } from '#utils/access';
import { access } from '#utils/access';
import { isTypeableElement } from '../../utils/popups/element';
import { useFilterDropdownRootContext } from '../../filter-dropdown/root/FilterDropdownRootContext';
import { refocusOwner, isRefocusingOwner } from '../../filter-dropdown/utils/refocusOwner';
import type { MenuRoot } from '../root/MenuRoot';
import { isCrossOrientationCloseKey } from '../../utils/popups/interactions/useListNavigation';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import type { HTMLProps } from '../../internals/types';

type PopupEvent<E extends Event> = E & { currentTarget: HTMLDivElement };

export function useMenuFilterPopup(
  orientation: MaybeAccessor<MenuRoot.Orientation>,
): Accessor<HTMLProps<HTMLDivElement>> {
  const context = useFilterDropdownRootContext();
  const direction = useDirection();
  const { focusOwnerRef } = context;

  // Focus that entered a nested popup by keyboard or click stays there while the
  // pointer crosses the parent popup. Returning to a submenu trigger restores focus to the
  // parent input. Focus that merely followed the pointer in follows it back out.
  const nestedFocusRef = { current: null as Element | null };
  // A tap fires compatibility mouse events, which must not focus the input and raise the
  // on-screen keyboard.
  const pointerTypeRef = { current: 'mouse' };

  function trackPointerType(event: PointerEvent) {
    pointerTypeRef.current = event.pointerType || 'mouse';
  }

  /* istanbul ignore else -- `process.env.NODE_ENV` is a build-time constant under test */
  if (process.env.NODE_ENV !== 'production') {
    useEffect(
      () => [context.open()] as const,
      ([open]) => {
        if (open && focusOwnerRef.current === null) {
          warn(
            'A filterable menu opened without a <Menu.Input>. Render the input inside ' +
              '<Menu.Popup>, or drop <Menu.FilterProvider> for a menu that does not filter.',
          );
        }
      },
    );
  }

  function restoreInputFocus(event: PopupEvent<MouseEvent>, enteredTrigger: boolean) {
    const focusOwner = focusOwnerRef.current;
    if (!context.open() || !focusOwner) {
      return;
    }

    const activeEl = activeElement(ownerDocument(event.currentTarget));
    if (activeEl === focusOwner || contains(event.currentTarget, activeEl)) {
      return;
    }

    // Nested popups are portalled, so their events still bubble through this React tree.
    // The composed path only contains this popup when the pointer is really over it, and a
    // closing popup must not re-capture focus during its exit transition.
    let submenuTrigger: HTMLElement | null = null;
    const nearestPopup = event.composedPath().find((node) => {
      if (!isHTMLElement(node)) {
        return false;
      }
      if (node.getAttribute('role') === 'dialog' || node.hasAttribute('data-rootownerid')) {
        return true;
      }
      if (node.hasAttribute('aria-haspopup')) {
        submenuTrigger = node;
      }
      return false;
    });
    if (nearestPopup !== event.currentTarget) {
      return;
    }

    // A nested popup that took focus keeps it while the pointer moves over the parent popup.
    // Entering a submenu trigger returns focus to the parent's input.
    if (nestedFocusRef.current && !(enteredTrigger && submenuTrigger)) {
      return;
    }
    if (
      enteredTrigger &&
      submenuTrigger &&
      isElement(event.relatedTarget) &&
      contains(submenuTrigger, event.relatedTarget)
    ) {
      return;
    }
    refocusOwner(focusOwner);
  }

  const props: HTMLProps<HTMLDivElement> = {
    // The input owns virtual focus.
    'aria-activedescendant': undefined,
    // Not valid on a dialog; the list's implicit orientation is already vertical.
    'aria-orientation': undefined,
    onMouseDown(event: PopupEvent<MouseEvent>) {
      if (getTarget(event) === event.currentTarget) {
        // Keep focus on the virtual focus owner when the popup's own background is pressed.
        event.preventDefault();
      }
    },
    onPointerDown: trackPointerType,
    // `pointerover` precedes the compatibility `mouseover`, so a mouse entering right after a tap
    // is recognized before the handoff below.
    onPointerOver: trackPointerType,
    onPointerMove: trackPointerType,
    onMouseMove(event: PopupEvent<MouseEvent>) {
      if (pointerTypeRef.current === 'mouse') {
        restoreInputFocus(event, false);
      }
    },
    onMouseOver(event: PopupEvent<MouseEvent>) {
      if (pointerTypeRef.current === 'mouse' && nestedFocusRef.current) {
        restoreInputFocus(event, true);
      }
    },
    // Solid port: `focusin`, which bubbles like React's `onFocus`.
    onFocusIn(event: PopupEvent<FocusEvent>) {
      // `focusin` bubbles, so this also sees the owner itself being focused.
      const target = getTarget(event);

      // Nested popups are portalled, so their focus events bubble through this React tree
      // while their elements sit outside this one in the DOM.
      if (target === focusOwnerRef.current) {
        nestedFocusRef.current = null;
      } else if (
        isHTMLElement(target) &&
        !contains(event.currentTarget, target) &&
        !isRefocusingOwner()
      ) {
        nestedFocusRef.current = target;
      }

      // Focus that lands on the popup itself, the focus manager's fallback target, moves on to
      // the input, which owns focus while the menu filters.
      if (context.open() && target === event.currentTarget) {
        focusOwnerRef.current?.focus({ preventScroll: true });
      }
    },
    onKeyDown(event: PopupEvent<KeyboardEvent>) {
      const target = getTarget(event);
      if (target === focusOwnerRef.current || isTypeableElement(target)) {
        return;
      }

      if (
        isCrossOrientationCloseKey(event.key, access(orientation), direction() === 'rtl', false)
      ) {
        focusOwnerRef.current?.focus({ preventScroll: true });
        // Nested popups bubble through this React tree, so keep the key from the parent.
        event.stopPropagation();
      }
    },
  };

  return () => props;
}
