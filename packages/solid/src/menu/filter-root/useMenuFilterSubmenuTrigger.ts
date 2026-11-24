import { createMemo } from 'solid-js';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { useEnhancedClickHandler } from '#utils/useEnhancedClickHandler';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { isVirtualPointerEvent } from '../../utils/popups/event';
import { useFilterDropdownItem } from '../../filter-dropdown/item/useFilterDropdownItem';
import { useFilterContextForList } from '../../filter-dropdown/root/FilterDropdownRootContext';
import type { MenuFilterItemParams, MenuFilterItemResult } from './MenuFilterContext';
import { useMenuRootContext } from '../root/MenuRootContext';
import type { BaseUIEvent, HTMLProps } from '../../internals/types';

/**
 * Registers a submenu trigger with the parent menu's filter and adapts it to a filterable
 * submenu: the trigger lives inside its own submenu root, but it is an item of the parent list.
 */
export function useMenuFilterSubmenuTrigger(params: MenuFilterItemParams): MenuFilterItemResult {
  // `virtualFocus` is set only by a filterable submenu root, so it tells this trigger whether the
  // submenu it opens renders a `role="dialog"` popup or a plain `role="menu"` one. The documented
  // plain-submenu recipe relies on the latter.
  const { store, virtualFocus } = useMenuRootContext();

  const open = store.useState('open');
  const mounted = store.useState('mounted');

  // The submenu root's provider shadows the enclosing one, but the trigger belongs to the list
  // it opens from, which is the parent menu's.
  // Solid port: a root's parent is fixed for its lifetime, so it is read once.
  const parent = store.select('parent');
  const parentListRef = parent.type === 'menu' ? parent.store.context.itemDomElements : null;
  const parentContext = useFilterContextForList(parentListRef);

  const { visible, ref } = useFilterDropdownItem({
    get label() {
      return params.label;
    },
    get children() {
      return params.children;
    },
    get render() {
      return params.render;
    },
    context: parentContext,
    get retainGroup() {
      return mounted();
    },
  });

  // Filtering the trigger out unmounts it, leaving its submenu open with no anchor.
  useIsoLayoutEffect(
    () => [visible(), open()] as const,
    ([isVisible, isOpen]) => {
      if (isVisible || !isOpen) {
        return;
      }
      store.setOpen(false, createChangeEventDetails(REASONS.none));
    },
  );

  const clickProps = useEnhancedClickHandler((event, interactionType) => {
    if (
      event.type === 'click' &&
      store.select('open') &&
      (interactionType === 'keyboard' ||
        (interactionType === 'mouse' &&
          store.select('lastOpenChangeReason') === REASONS.triggerPress))
    ) {
      store.context.virtualFocusRef?.current?.focus({ preventScroll: true });
    }
  });

  // Solid port: typed loosely, since a handler receiving a `BaseUIEvent` isn't a JSX handler type.
  const handlers: Record<string, unknown> = {
    onPointerDown(event: PointerEvent) {
      clickProps.onPointerDown(event);
      store.context.virtualPress = isVirtualPointerEvent(event);
    },
    onFocus(event: BaseUIEvent<FocusEvent> & { currentTarget: HTMLElement; target: Element }) {
      // A plain parent menu moves DOM focus to whichever item the pointer crosses. While this
      // trigger's submenu is open and its input held focus, hand focus straight back so crossing
      // the trigger doesn't interrupt typing.
      const focusOwner = store.context.virtualFocusRef?.current;
      if (focusOwner && store.select('open') && event.relatedTarget === focusOwner) {
        event.preventBaseUIHandler();
        focusOwner.focus({ preventScroll: true });
      }
    },
  };

  const props = createMemo<HTMLProps>(() => ({
    // Omitted rather than `undefined`, which would clear the `'menu'` the root puts on every
    // trigger.
    ...(virtualFocus() ? { 'aria-haspopup': 'dialog' as const } : undefined),
    ...clickProps,
    ...handlers,
  }));

  if (parentContext === null) {
    // A plain parent menu roves DOM focus across its items and never filters them.
    return { visible: () => true, ref: null, props };
  }

  return { visible: () => visible() || mounted(), ref, props };
}
