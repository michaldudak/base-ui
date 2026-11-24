import { untrack } from 'solid-js';
import { ownerDocument } from '#utils/owner';
import { activeElement, contains } from '#utils/shadowDom';
import { useIsoLayoutEffect } from '#utils/useEffect';
import type { MaybeAccessor } from '#utils/access';
import { access } from '#utils/access';
import type { MenuParent, MenuRoot } from '../root/MenuRoot';
import type { MenuStore } from '../store/MenuStore';
import { REASONS } from '../../internals/reasons';
import type { MenuFilterParentHandoff } from './MenuFilterContext';

/**
 * A plain submenu whose parent is filterable. The parent keeps real focus on its input, so its
 * trigger never blurs and its return focus waits for this popup's exit animation. The submenu
 * hands focus and the parent's highlight back itself.
 */
export function useVirtualFocusParentHandoff(
  store: MenuStore<unknown>,
  parent: MaybeAccessor<MenuParent>,
  open: MaybeAccessor<boolean>,
  virtualFocus: MaybeAccessor<boolean>,
): MenuFilterParentHandoff {
  // Solid port: a root's parent is fixed for its lifetime, so it is read once.
  const parentValue = untrack(() => access(parent));
  const parentStore = parentValue.type === 'menu' ? parentValue.store : null;
  const parentVirtualFocusRef = parentStore?.context.virtualFocusRef;

  const returnToParent = (
    trigger: Element | null,
    reason: MenuRoot.ChangeEventReason | null,
    isVirtualFocus: boolean,
  ) => {
    const focusOwner = parentVirtualFocusRef?.current;
    if (isVirtualFocus || store.select('open') || !parentStore?.select('open') || !focusOwner) {
      return;
    }

    if (contains(store.context.popupRef.current, activeElement(ownerDocument(focusOwner)))) {
      focusOwner.focus({ preventScroll: true });
    }

    if (
      (reason === REASONS.listNavigation || reason === REASONS.escapeKey) &&
      parentStore.state.activeIndex == null
    ) {
      // The closing key is gone by this microtask, so there is no event to report it with.
      parentStore.highlightItem(trigger, REASONS.none);
    }
  };

  // Solid port: the root's unmount, a passive effect in React that runs after this layout effect,
  // runs before it here (parents' effects run first) and clears `activeTriggerElement` in the same
  // flush. Keep the trigger the open popup was anchored to so the close below still sees it.
  const activeTriggerElement = store.useState('activeTriggerElement');
  let openTriggerElement: Element | null = null;
  useIsoLayoutEffect(
    () => [access(open), activeTriggerElement()] as const,
    ([isOpen, element]) => {
      if (isOpen) {
        openTriggerElement = element;
      }
    },
  );

  useIsoLayoutEffect(
    // Solid port: `virtualFocus` is read through the stable callback in React, so it is passed
    // along without being a dependency.
    () => [access(open), untrack(() => access(virtualFocus))] as const,
    ([isOpen, isVirtualFocus]) => {
      if (!isOpen) {
        // A parent closing in the same commit, such as on an item press, syncs its controlled `open`
        // in its own layout effect, which runs after this one. An unmount can clear the trigger by
        // then, so read it now.
        const trigger = store.state.activeTriggerElement ?? openTriggerElement;
        openTriggerElement = null;
        const reason = store.select('lastOpenChangeReason');
        queueMicrotask(() => returnToParent(trigger, reason, isVirtualFocus));
      }
    },
  );

  // Real focus entering this submenu is when a plain parent's trigger would blur: the parent has
  // no active item until a keyboard close hands the cursor back to the trigger.
  function handleFocus() {
    if (!access(virtualFocus) && parentVirtualFocusRef && parentStore?.state.activeIndex != null) {
      parentStore.setActiveIndex(null, REASONS.none);
    }
  }

  return { parentVirtualFocusRef, handleFocus };
}
