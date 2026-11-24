import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import { platform } from '#utils/platform';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import type { HTMLProps } from '../../internals/types';
import type { MenuStore } from '../store/MenuStore';
import { REASONS } from '../../internals/reasons';
import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext';
import { useMenuRootContext } from '../root/MenuRootContext';
import { dispatchClickWithModifiers } from '../../utils/dispatchClickWithModifiers';
import type { UseMenuItemMetadata } from './useMenuItem';

function preventMouseDownDefault(event: MouseEvent) {
  event.preventDefault();
}

export interface UseMenuItemCommonPropsParameters {
  /**
   * Whether to close the menu when the item is clicked.
   */
  closeOnClick: MaybeAccessor<boolean>;
  /**
   * Determines if the menu item is highlighted.
   */
  highlighted: MaybeAccessor<boolean>;
  /**
   * The id of the menu item.
   */
  id: MaybeAccessor<string | undefined>;
  /**
   * The node id of the menu positioner.
   */
  nodeId: MaybeAccessor<string | undefined>;
  /**
   * The menu store.
   */
  store: MenuStore<any>;
  /**
   * Whether a typeahead session is in progress.
   */
  typingRef?: { current: boolean } | undefined;
  /**
   * Ref to the item element.
   */
  itemRef: { current: HTMLElement | null };
  /**
   * Metadata for checking item type before triggering click.
   */
  itemMetadata: UseMenuItemMetadata;
}

/**
 * Returns common props shared by all menu item types.
 * This hook extracts the shared logic for id, role, tabIndex, and interaction handlers.
 */
export function useMenuItemCommonProps(
  params: UseMenuItemCommonPropsParameters,
): Accessor<HTMLProps> {
  const { store, typingRef, itemRef, itemMetadata } = params;

  const rootContext = useMenuRootContext();
  const contextMenuContext = useContextMenuRootContext(true);

  // A submenu trigger is an item of the parent menu's list, so it follows that list's focus model.
  const isSubmenuTrigger = itemMetadata.type === 'submenu-trigger';
  const virtualFocus = () =>
    isSubmenuTrigger ? rootContext.parentVirtualFocus() : rootContext.virtualFocus();
  const selectionStore = createMemo(() => {
    const parent = rootContext.parent();
    return isSubmenuTrigger && parent.type === 'menu' ? parent.store : rootContext.store;
  });
  // Solid port: the store a selector reads from can change, so the selector is read through
  // `selectTracked()` instead of a `useState` accessor bound to one store.
  const ariaSelected = createMemo(() => {
    return selectionStore().selectTracked('webkitAriaSelected', access(params.highlighted));
  });

  const highlightedWhileOpen = store.useState('highlightedWhileOpen', () =>
    access(params.highlighted),
  );

  const isContextMenu = contextMenuContext !== undefined;
  // `-1` rather than omitting it, which leaves links and buttons in the tab order.
  const tabIndex = () => (!virtualFocus() && highlightedWhileOpen() ? 0 : -1);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === ' ' && typingRef?.current) {
      event.preventDefault();
    }
  }

  function onMouseMove(event: MouseEvent) {
    const nodeId = access(params.nodeId);
    if (!nodeId) {
      return;
    }

    // Inform the floating tree that a menu item within this menu was hovered/moved over
    // so unrelated descendant submenus can be closed.
    store.select('floatingTreeRoot').events.emit('itemhover', {
      nodeId,
      target: event.currentTarget,
    });
  }

  function onClick(event: MouseEvent) {
    if (access(params.closeOnClick)) {
      store
        .select('floatingTreeRoot')
        .events.emit('close', { domEvent: event, reason: REASONS.itemPress });
    }
  }

  function onMouseUp(event: MouseEvent) {
    if (contextMenuContext) {
      const initialCursorPoint = contextMenuContext.initialCursorPointRef.current;
      contextMenuContext.initialCursorPointRef.current = null;
      if (
        isContextMenu &&
        initialCursorPoint &&
        Math.abs(event.clientX - initialCursorPoint.x) <= 1 &&
        Math.abs(event.clientY - initialCursorPoint.y) <= 1
      ) {
        return;
      }

      // On non-macOS platforms, this mouseup belongs to the right-click gesture
      // that opened the context menu, so it must not activate an item.
      if (isContextMenu && !platform.os.mac && event.button === 2) {
        return;
      }
    }

    if (
      itemRef.current &&
      itemMetadata.type === 'regular-item' &&
      store.context.allowMouseUpTriggerRef.current &&
      (!isContextMenu || event.button === 2)
    ) {
      // Drag release has no mousedown on this item. Focus it before activation so
      // arrow navigation continues from it when the menu stays open.
      if (!virtualFocus()) {
        itemRef.current.focus({ preventScroll: true });
      }
      // The press started on the trigger and was released over the item, so the item
      // needs a synthetic click. Its `closeOnClick` preference still applies.
      // `detail: 1` and `pointerType: 'mouse'` mark this as a mouse-gesture click so
      // MenuRoot and FloatingFocusManager don't treat it as a keyboard activation.
      dispatchClickWithModifiers(itemRef.current, event, {
        detail: 1,
        pointerType: 'mouse',
      });
    }
  }

  return createMemo<HTMLProps>(() => ({
    id: access(params.id),
    role: 'menuitem' as const,
    tabindex: tabIndex(),
    // Solid's typings only accept the string form; `useRenderElement` renders `true` as "true".
    'aria-selected': ariaSelected() ? ('true' as const) : undefined,
    // Real focus stays on the input or list that owns virtual navigation.
    onMouseDown: virtualFocus() ? preventMouseDownDefault : undefined,
    onKeyDown,
    onMouseMove,
    onClick,
    onMouseUp,
  }));
}

export interface UseMenuItemCommonPropsState {}
