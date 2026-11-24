import { createMemo, createSignal, Show, untrack, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useTimeout } from '#utils/useTimeout';
import { KEEP } from '#utils/store';
import { useEffect, useIsoLayoutEffect, useOnMount, useExternalEffect } from '#utils/useEffect';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '#utils/empty';
import {
  FloatingTree,
  useFloatingNodeId,
  useFloatingParentNodeId,
} from '../../utils/popups/tree/FloatingTree';
import { useDismiss } from '../../utils/popups/interactions/useDismiss';
import { useListNavigation } from '../../utils/popups/interactions/useListNavigation';
import { useTypeahead } from '../../utils/popups/interactions/useTypeahead';
import { MenuRootContext, useMenuRootContext } from './MenuRootContext';
import type { MenubarContext } from '../../menubar/MenubarContext';
import { useMenubarContext } from '../../menubar/MenubarContext';
import { TYPEAHEAD_RESET_MS } from '../../internals/constants';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import { useOpenInteractionType } from '../../utils/popups/interactions/useOpenInteractionType';
import { createGenericEventDetails } from '../../internals/createBaseUIEventDetails';
import type {
  BaseUIChangeEventDetails,
  BaseUIHighlightEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { getHighlightReason } from '../../utils/getHighlightReason';
import type { ContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext';
import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext';
import { mergeProps } from '../../merge-props/mergeProps';
import { useAnimationsFinished } from '../../internals/useAnimationsFinished';
import { MenuStore } from '../store/MenuStore';
import type { MenuHandle } from '../store/MenuHandle';
import type { MenuCommittedOpenState, MenuTriggerData } from '../store/MenuStore';
import type { PayloadChildRenderFunction } from '../../utils/popups/popupRoot';
import {
  usePopupRootWithPopupId,
  renderPopupRootChildren,
  useActiveTriggerData,
} from '../../utils/popups/popupRoot';
import {
  FOCUSABLE_POPUP_PROPS,
  usePopupInteractionProps,
} from '../../utils/popups/popupStoreUtils';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { MenuFilterProviderContext } from '../filter-provider/MenuFilterProviderContext';
import type { HTMLProps } from '../../internals/types';

/**
 * @internal
 */
export function MenuRootInternal<Payload>(props: MenuRootInternalProps<Payload>): JSX.Element {
  const loopFocus = () => props.loopFocus ?? true;
  const orientation = () => props.orientation ?? 'vertical';
  const closeParentOnEsc = () => props.closeParentOnEsc ?? false;
  const highlightItemOnHover = () => props.highlightItemOnHover ?? true;
  const virtualFocus = () => props.virtualFocus ?? false;
  const allowEscape = () => props.allowEscape ?? true;
  const resetOnPointerLeave = () => props.resetOnPointerLeave ?? true;

  const contextMenuContext = useContextMenuRootContext(true);
  const parentMenuRootContext = useMenuRootContext(true);
  const menubarContext = useMenubarContext(true);

  // Depend on the stable pieces rather than the parent context object, so a parent context
  // invalidation doesn't cascade into every descendant root's context.
  const enclosingMenuStore = parentMenuRootContext?.store;
  const parentVirtualFocus = () => parentMenuRootContext?.virtualFocus() ?? false;

  // Solid port: the contexts are stable objects and `isSubmenu` is an internal prop fixed for the
  // lifetime of the root (`Menu.SubmenuRoot` always passes it), so the parent is computed once.
  const isSubmenu = untrack(() => props.isSubmenu ?? false);
  const parentFromContextValue: MenuParent = (() => {
    if (isSubmenu && enclosingMenuStore) {
      return {
        type: 'menu',
        store: enclosingMenuStore,
      };
    }

    if (menubarContext) {
      return {
        type: 'menubar',
        context: menubarContext,
      };
    }

    // Ensure this is not a Menu nested inside ContextMenu.Trigger.
    // ContextMenu parentContext is always undefined as ContextMenu.Root is instantiated with
    // <MenuRootContext value={null}>
    if (contextMenuContext && !enclosingMenuStore) {
      return {
        type: 'context-menu',
        context: contextMenuContext,
      };
    }

    return {
      type: undefined,
    };
  })();
  const parentFromContext: Accessor<MenuParent> = () => parentFromContextValue;

  const rootId = useBaseUiId();
  const generatedPopupId = useBaseUiId();

  const [renderedPopupId, setRenderedPopupId] = createSignal<string | undefined>(undefined, {
    ownedWrite: true,
  });

  // A registered `''` means the popup rendered with an explicitly empty id, so nothing may point
  // at the generated fallback.
  const defaultPopupId = () => (renderedPopupId() ?? generatedPopupId()) || undefined;

  const floatingParentNodeIdFromContext = useFloatingParentNodeId();

  const parentMenuStore =
    parentFromContextValue.type === 'menu' ? parentFromContextValue.store : undefined;
  // An initially open submenu should animate in only when the user watches it appear, i.e. when
  // its subtree mounts because the parent popup is playing its own enter transition. A parent
  // that was `defaultOpen` at page load never passes through `'starting'`, and under a
  // `keepMounted` parent these initializers run at page load while the parent's status is still
  // `undefined` — in both cases the submenu is page-load content that must not animate. Gated on
  // being open at mount so a closed submenu doesn't seed `instantType` it would never clear.
  // Read once, on creation (a deliberate snapshot): consumed exclusively by initializers below.
  const animateInitialOpen = untrack(
    () =>
      (props.open ?? props.defaultOpen ?? false) &&
      parentMenuStore?.state.transitionStatus === 'starting',
  );

  // Mirror an instantly-opened parent (e.g. keyboard click) so `[data-instant]` styling
  // suppresses the enter transition on both popups or neither. Captured once —
  // `animateInitialOpen` is only meaningful on creation.
  const seededInstantType = animateInitialOpen ? parentMenuStore?.state.instantType : undefined;

  const { store, open, payload, transitionStatus } = usePopupRootWithPopupId(
    props,
    (initialState, initialPopupId) => {
      const menuStore = new MenuStore<Payload>(
        {
          ...initialState,
          parent: parentFromContextValue,
          disabled: props.disabled ?? false,
          highlightItemOnHover: highlightItemOnHover(),
          modal: parentFromContextValue.type === undefined ? props.modal : undefined,
          rootId: rootId(),
          instantType: seededInstantType,
        },
        initialPopupId,
      );
      // A stable ref object, so descendants can read it from the start.
      menuStore.context.virtualFocusRef = props.virtualFocusRef;
      return menuStore;
    },
    defaultPopupId,
    { animateInitialOpen, handle: () => props.handle },
  );

  const floatingTreeRoot = store.useState('floatingTreeRoot');

  // The tree is read once (`useFloatingNodeId` treats it as stable).
  const floatingNodeIdFromContext = useFloatingNodeId(store.select('floatingTreeRoot'));

  const activeTriggerElement = store.useState('activeTriggerElement');
  const positionerElement = store.useState('positionerElement');
  const hoverEnabled = store.useState('hoverEnabled');
  const disabled = store.useState('disabled');
  const parent = store.useState('parent');
  const activeIndex = store.useState('activeIndex');
  const keyboardOpen = store.useState('keyboardOpen');
  const floatingParentNodeId = store.useState('floatingParentNodeId');

  const allowOutsidePressDismissalRef = {
    current: store.select('parent').type !== 'context-menu',
  };
  const allowOutsidePressDismissalTimeout = useTimeout();

  const nested = () => floatingParentNodeId() != null;

  if (process.env.NODE_ENV !== 'production') {
    useEffect(
      () => [parent().type, props.modal] as const,
      ([parentType, modalProp]) => {
        if (parentType !== undefined && modalProp !== undefined) {
          console.warn(
            'Base UI: The `modal` prop is not supported on nested menus. It will be ignored.',
          );
        }
      },
    );
  }

  const { openMethod, triggerProps: interactionTypeProps } = useOpenInteractionType(open);

  store.useSyncedValues(() => ({
    disabled: props.disabled ?? false,
    highlightItemOnHover: highlightItemOnHover(),
    modal: parent().type === undefined ? props.modal : undefined,
    openMethod: openMethod(),
    rootId: rootId(),
  }));

  const runOnceAnimationsFinish = useAnimationsFinished(store.context.popupRef);

  // An inherited `instantType` is only for the initial reveal. A later controlled `open` flip
  // bypasses `setOpen`, so nothing would reset it and `[data-instant]` would wrongly suppress
  // every subsequent transition. Clear it once the enter phase settles, unless an interactive
  // open change already replaced it.
  // A controlled close can interrupt the initial enter before the animations-finished callback
  // below fires (its abort cancels the pending callback, and a closed popup schedules no new
  // one). Nothing is left to protect once closing starts — the exit's suppression was already
  // decided at its trigger commit — so the seeded value does not outlive the open state, or the
  // next reopen would render a stale `[data-instant]`.
  if (seededInstantType !== undefined) {
    store.useDerivedValue('instantType', (instantType) =>
      !open() && instantType === seededInstantType ? undefined : KEEP,
    );
  }

  // Waits for the popup's animations, which are outside the reactive graph.
  useExternalEffect(
    () => [open(), transitionStatus()] as const,
    ([isOpen, currentTransitionStatus]) => {
      if (seededInstantType === undefined || !isOpen) {
        return undefined;
      }

      const clearSeededInstantType = () => {
        if (store.state.instantType === seededInstantType) {
          store.set('instantType', undefined);
        }
      };

      if (currentTransitionStatus !== undefined) {
        return undefined;
      }

      // With no popup element (e.g. its subtree is waiting on data), there is no enter transition
      // to protect, and `useAnimationsFinished` would return without invoking the callback.
      // Clear immediately: a popup that appears after the reveal settles is page-load-like
      // content.
      if (store.context.popupRef.current == null) {
        clearSeededInstantType();
        return undefined;
      }

      const abortController = new AbortController();
      runOnceAnimationsFinish(clearSeededInstantType, abortController.signal);

      return () => {
        abortController.abort();
      };
    },
  );

  // What the menu takes from the trigger it is open from. `Menu.Trigger` registers these along
  // with its element; here they are derived from the active trigger, so they change in the same
  // pass as the active trigger does. While no trigger is active the store keeps the last values,
  // and they can still be written (a handle's `openWithPayload()` sets the payload).
  const triggerData = useActiveTriggerData<MenuTriggerData<Payload>>(store);

  function fromTrigger<Key extends keyof MenuTriggerData<Payload>>(key: Key) {
    return () => {
      const data = triggerData();
      return data ? data[key] : KEEP;
    };
  }

  store.useDerivedValue('payload', fromTrigger('payload'));
  store.useDerivedValue('floatingTreeRoot', fromTrigger('floatingTreeRoot'));
  store.useDerivedValue('keyboardEventRelay', fromTrigger('keyboardEventRelay'));
  if (!parentMenuRootContext) {
    // A submenu's close delay comes from its `Menu.SubmenuTrigger`, which syncs it itself.
    store.useDerivedValue('closeDelay', fromTrigger('closeDelay'));
  }

  if (contextMenuContext && !parentMenuRootContext) {
    // This is a context menu root.
    // It doesn't support detached triggers yet, so it supplies the parent and the tree IDs itself.
    store.useSyncedValues(() => ({
      parent: { type: 'context-menu' as const, context: contextMenuContext },
      floatingNodeId: floatingNodeIdFromContext,
      floatingParentNodeId: floatingParentNodeIdFromContext(),
    }));
  } else {
    store.useDerivedValue('parent', fromTrigger('parent'));
    // Without an active trigger, and in a submenu, the root supplies its own tree IDs.
    const usesOwnTreeIds = () => parentMenuRootContext != null || !activeTriggerElement();
    store.useDerivedValue('floatingNodeId', () =>
      usesOwnTreeIds() ? floatingNodeIdFromContext : fromTrigger('floatingNodeId')(),
    );
    store.useDerivedValue('floatingParentNodeId', () =>
      usesOwnTreeIds() ? floatingParentNodeIdFromContext() : fromTrigger('floatingParentNodeId')(),
    );
  }

  useEffect(
    () => [open(), parent().type] as const,
    ([isOpen, parentType]) => {
      if (!isOpen) {
        store.context.lastOpenChangeEvent = undefined;
      }

      if (parentType !== 'context-menu') {
        return;
      }

      if (!isOpen) {
        allowOutsidePressDismissalTimeout.clear();
        allowOutsidePressDismissalRef.current = false;
        return;
      }

      // With `mousedown` outside press events and long press touch input, there
      // needs to be a grace period after opening to ensure the dismissal event
      // doesn't fire immediately after open.
      allowOutsidePressDismissalTimeout.start(500, () => {
        allowOutsidePressDismissalRef.current = true;
      });
    },
  );

  useOnMount(() => store.context.allowTouchToCloseTimeout.disposeEffect());

  // State that starts over when the menu closes. These are writable derived values: they can be
  // written while the menu is open, and closing the menu resets them. (In React, effects reset
  // them after the menu has rendered as closed.)
  store.useDerivedValue('hoverEnabled', () => (open() ? KEEP : true));
  store.useDerivedValue('activeIndex', () => (open() ? KEEP : null));

  const lastOpenChangeReason = store.useState('lastOpenChangeReason');
  // Repeated open requests are compared against what this Root last committed.
  // Solid port: kept in a plain object updated from an effect (React reads the values of the last
  // committed render), so `setOpen` can read it from anywhere, including other effects.
  const committedOpenState: { current: MenuCommittedOpenState } = {
    current: { open: false, activeTriggerElement: null, openChangeReason: null },
  };
  const getCommittedOpenState = () => committedOpenState.current;

  // Open changes are run only while this Root is mounted. A request made before it mounts, such as
  // `handle.open()` from a child's first effect, or after it unmounts, is dropped.
  useIsoLayoutEffect(
    () => [open(), activeTriggerElement(), lastOpenChangeReason()] as const,
    ([isOpen, currentActiveTriggerElement, openChangeReason]) => {
      committedOpenState.current = {
        open: isOpen,
        activeTriggerElement: currentActiveTriggerElement,
        openChangeReason,
      };
    },
  );
  useIsoLayoutEffect(
    () => [],
    () => {
      store.context.getCommittedOpenState = getCommittedOpenState;
      return () => {
        store.context.getCommittedOpenState = undefined;
      };
    },
  );

  // `useImperativeHandle(ctx?.positionerRef, () => positionerElement)`
  useIsoLayoutEffect(
    () => [parent(), positionerElement()] as const,
    ([currentParent, currentPositionerElement]) => {
      let ctx: ContextMenuRootContext | undefined;
      if (currentParent.type === 'context-menu') {
        ctx = currentParent.context;
      }
      if (!ctx) {
        return undefined;
      }
      const positionerRef = ctx.positionerRef;
      positionerRef.current = currentPositionerElement;
      return () => {
        positionerRef.current = null;
      };
    },
  );

  // `useImperativeHandle(ctx?.actionsRef, () => ({ setOpen: store.setOpen }))`
  useIsoLayoutEffect(
    () => [parent()] as const,
    ([currentParent]) => {
      let ctx: ContextMenuRootContext | undefined;
      if (currentParent.type === 'context-menu') {
        ctx = currentParent.context;
      }
      if (!ctx) {
        return undefined;
      }
      const actionsRef = ctx.actionsRef;
      actionsRef.current = { setOpen: store.setOpen };
      return () => {
        actionsRef.current = null;
      };
    },
  );

  const dismiss = useDismiss(store, {
    enabled: () => !disabled(),
    bubbles: () => ({ escapeKey: closeParentOnEsc() && parent().type === 'menu' }),
    outsidePress() {
      if (
        store.select('parent').type !== 'context-menu' ||
        store.context.lastOpenChangeEvent?.type === 'contextmenu'
      ) {
        return true;
      }

      return allowOutsidePressDismissalRef.current;
    },
    // Read once by the hook. A submenu belongs to its parent's tree, which is also the tree its
    // context provides, so the initial value is the one React settles on.
    externalTree:
      store.select('floatingParentNodeId') != null ? store.select('floatingTreeRoot') : undefined,
  });

  const direction = useDirection();

  const listNavigation = useListNavigation(store, {
    enabled: () => !disabled(),
    listRef: store.context.itemDomElements,
    activeIndex,
    virtual: virtualFocus,
    nested: () => parent().type === 'menubar' || (!virtualFocus() && parent().type !== undefined),
    parentOrientation: () => {
      const currentParent = parent();
      return currentParent.type === 'menubar' ? currentParent.context.orientation() : undefined;
    },
    loopFocus,
    // Filtered menus keep DOM focus on the input, while keyboard and virtual opens initially
    // highlight an item as ordinary menus do. The input stays in the arrow-key loop unless the
    // filter highlights automatically.
    focusItemOnOpen: () => (virtualFocus() ? keyboardOpen() : undefined),
    allowEscape: () => virtualFocus() && loopFocus() && allowEscape(),
    orientation,
    // A virtual-focus list can navigate on either axis, but its trigger always opens on the
    // vertical one.
    triggerOrientation: () => (virtualFocus() ? 'vertical' : orientation()),
    rtl: () => direction() === 'rtl',
    disabledIndices: EMPTY_ARRAY,
    onNavigate(nextActiveIndex, event) {
      store.setActiveIndex(nextActiveIndex, getHighlightReason(event), event);
    },
    // A virtual-focus submenu's keyboard opening is orchestrated by its navigation wrapper based
    // on both menus' orientations; the generic arrow-key opening would also react to the parent's
    // forwarded cross-axis keys while closed.
    openOnArrowKeyDown: () => parent().type !== 'context-menu' && !(virtualFocus() && isSubmenu),
    // A root context menu's focus manager is modal, so its guard swallows Tab when no item is
    // tabbable. Close it here instead, as a regular menu closes when Tab moves focus out.
    closeOnTab: () => parent().type === 'context-menu',
    // Read once by the hook (see `externalTree` of `useDismiss` above).
    externalTree:
      !untrack(virtualFocus) && store.select('floatingParentNodeId') != null
        ? store.select('floatingTreeRoot')
        : undefined,
    nestedReturnFocusRef: parentMenuStore?.context.virtualFocusRef,
    focusItemOnHover: highlightItemOnHover,
    resetOnPointerLeave,
  });

  const onTyping = (nextTyping: boolean) => {
    store.context.typingRef.current = nextTyping;
  };

  const typeahead = useTypeahead(store, {
    // Under virtual focus the input owns typing, so typeahead would race the filter query.
    enabled: () => !disabled() && !virtualFocus(),
    listRef: store.context.itemLabels,
    elementsRef: store.context.itemDomElements,
    activeIndex,
    resetMs: TYPEAHEAD_RESET_MS,
    onMatch: (index, event) => {
      if (store.select('open') && index !== store.state.activeIndex) {
        store.setActiveIndex(index, REASONS.keyboard, event);
      }
    },
    onTyping,
  });

  // Solid port: `syncHighlightedItem` also runs from effects (here and in `CompositeList`), where
  // props can't be read, so the values it needs are kept current from an effect. A parent's
  // effects run before its children's, so this one runs before any of those calls.
  const latestProps = {
    virtualFocus: false,
    onItemHighlighted: undefined as MenuRoot.Props['onItemHighlighted'],
  };
  useIsoLayoutEffect(
    () => [virtualFocus(), props.onItemHighlighted] as const,
    ([currentVirtualFocus, currentOnItemHighlighted]) => {
      latestProps.virtualFocus = currentVirtualFocus;
      latestProps.onItemHighlighted = currentOnItemHighlighted;
    },
  );

  const lastHighlightIndexRef = { current: -1 };

  // Runs when `activeIndex` commits and again when the item registry settles, since an index
  // can come to point at a different element while its value stays the same.
  const syncHighlightedItem = () => {
    const index = store.state.activeIndex;
    const item =
      index === null ? undefined : (store.context.itemDomElements.current[index] ?? undefined);
    // An item removed in this commit stays registered until the list flushes, which calls back
    // here with the settled registry.
    if (item?.isConnected === false) {
      return;
    }

    const itemIndex = item === undefined ? -1 : index!;
    if (lastHighlightIndexRef.current === itemIndex && store.context.reportedItem === item) {
      return;
    }

    lastHighlightIndexRef.current = itemIndex;
    store.context.reportedItem = item;
    // Only virtual focus renders from the highlighted element. Publishing it in every menu would
    // notify each item's subscription on every highlight change.
    if (latestProps.virtualFocus) {
      store.set('highlightedItem', item);
    }
    // The tag left by the write that produced this committed value.
    const { highlightReason, highlightEvent } = store.context;
    store.context.highlightReason = REASONS.none;
    store.context.highlightEvent = undefined;
    const onItemHighlighted = latestProps.onItemHighlighted;
    if (!onItemHighlighted) {
      return;
    }
    onItemHighlighted(
      item,
      createGenericEventDetails(highlightReason, highlightEvent, {
        label:
          item === undefined
            ? undefined
            : (store.context.itemLabels.current[itemIndex] ?? undefined),
      }),
    );
  };

  // The highlighted element is looked up in the item registry, which lives outside the reactive
  // graph, so it is reported from an effect.
  useExternalEffect(
    () => [activeIndex()] as const,
    () => {
      syncHighlightedItem();
    },
  );

  // Under virtual focus an element inside the popup holds real focus, so it takes the
  // navigation's reference props (`aria-activedescendant` and the key handling) and the trigger
  // keeps only the props that open the menu.
  const openTriggerProps = createMemo((): HTMLProps => {
    if (!virtualFocus()) {
      return listNavigation.reference();
    }
    const triggerProps = listNavigation.trigger();
    if (!triggerProps) {
      return EMPTY_OBJECT;
    }
    // Focusing the trigger while the menu is open must not seed the virtual highlight. This can
    // happen before a pointer press closes the menu in Safari.
    const { onFocus, ...rest } = triggerProps;
    return rest;
  });

  store.useSyncedValue('inputProps', () =>
    virtualFocus() ? (listNavigation.reference() ?? EMPTY_OBJECT) : EMPTY_OBJECT,
  );

  const onTriggerMouseMove = () => {
    store.set('allowMouseEnter', true);
  };

  const activeTriggerProps = createMemo(() => {
    const mergedProps = mergeProps(
      typeahead.reference(),
      openTriggerProps(),
      dismiss.reference?.(),
      {
        onMouseMove: onTriggerMouseMove,
      },
      interactionTypeProps(),
    );

    mergedProps['aria-haspopup'] = 'menu';
    mergedProps['aria-expanded'] = open() ? 'true' : 'false';

    return mergedProps;
  });

  const inactiveTriggerProps = createMemo(() => {
    const mergedProps = mergeProps(
      listNavigation.trigger(),
      dismiss.trigger?.(),
      interactionTypeProps(),
    );

    mergedProps['aria-haspopup'] = 'menu';
    mergedProps['aria-expanded'] = false;

    return mergedProps;
  });

  const popupHandlers = {
    onMouseMove() {
      store.set('allowMouseEnter', true);
      if (store.select('parent').type === 'menu') {
        store.set('hoverEnabled', false);
      }
    },
    onClick() {
      if (store.select('hoverEnabled')) {
        store.set('hoverEnabled', false);
      }
    },
    onKeyDown(event: KeyboardEvent) {
      // The Menubar's CompositeRoot captures keyboard events via
      // event delegation. This works well when Menu.Root is nested inside Menubar,
      // but with detached triggers we need to manually forward the event to the CompositeRoot.
      const relay = store.select('keyboardEventRelay');
      if (relay && !event.cancelBubble) {
        relay(event);
      }
    },
  };

  const popupProps = createMemo(() =>
    mergeProps(
      FOCUSABLE_POPUP_PROPS,
      popupHandlers,
      typeahead.floating(),
      listNavigation.floating(),
      dismiss.floating?.(),
    ),
  );

  const itemProps = () => listNavigation.item() ?? EMPTY_OBJECT;

  // The initial values are applied immediately, so triggers created below see them.
  usePopupInteractionProps(store, () => ({
    activeTriggerProps: activeTriggerProps(),
    inactiveTriggerProps: inactiveTriggerProps(),
    popupProps: popupProps(),
    itemProps: itemProps(),
  }));

  const context: MenuRootContext<Payload> = {
    store,
    parent: parentFromContext,
    orientation,
    loopFocus,
    allowEscape,
    generatedPopupId,
    setRenderedPopupId,
    virtualFocus,
    parentVirtualFocus,
    syncHighlightedItem,
  };

  const renderContent = () => (
    <MenuRootContext value={context as MenuRootContext}>
      {renderPopupRootChildren({
        store,
        get children() {
          return props.children;
        },
        payload,
      })}
    </MenuRootContext>
  );

  const usesOwnFloatingTree = createMemo(
    () => parent().type === undefined || parent().type === 'context-menu',
  );

  return (
    <Show when={usesOwnFloatingTree()} fallback={renderContent()}>
      {/* set up a FloatingTree to provide the context to nested menus */}
      <FloatingTree externalTree={floatingTreeRoot()}>{renderContent()}</FloatingTree>
    </Show>
  );
}

/**
 * Groups all parts of the menu.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuRoot<Payload>(props: MenuRoot.Props<Payload>): JSX.Element {
  const filterProvider = useContext(MenuFilterProviderContext);

  if (filterProvider === null) {
    return <MenuRootInternal {...props} />;
  }

  const FilterRoot = filterProvider.Root;

  return (
    // The root consumes its provider so a plain submenu inside doesn't inherit it.
    <MenuFilterProviderContext value={null}>
      <FilterRoot {...filterProvider.options} {...props} />
    </MenuFilterProviderContext>
  );
}

export interface MenuRootState {}

interface MenuRootInternalProps<Payload> extends MenuRoot.Props<Payload> {
  /**
   * Marks this root as a submenu of the enclosing menu.
   */
  isSubmenu?: boolean | undefined;
  /**
   * Keeps real focus on an element inside the popup and navigates the list with
   * `aria-activedescendant`.
   */
  virtualFocus?: boolean | undefined;
  /**
   * The element that retains real focus while virtual list navigation is active.
   */
  virtualFocusRef?: { current: HTMLElement | null } | undefined;
  /**
   * Whether virtual focus can leave the list during arrow navigation.
   */
  allowEscape?: boolean | undefined;
  /**
   * Whether pointer leave should clear the active item.
   */
  resetOnPointerLeave?: boolean | undefined;
}

export interface MenuRootProps<Payload = unknown> {
  /**
   * Whether the menu is initially open.
   *
   * To render a controlled menu, use the `open` prop instead.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Whether to loop keyboard focus back to the first item
   * when the end of the list is reached while using the arrow keys.
   * @default true
   */
  loopFocus?: boolean | undefined;
  /**
   * Whether moving the pointer over items should highlight them.
   * Disabling this prop allows CSS `:hover` to be differentiated from the `:focus` (`data-highlighted`) state.
   * @default true
   */
  highlightItemOnHover?: boolean | undefined;
  /**
   * Determines if the menu enters a modal state when open.
   * - `true`: user interaction is limited to the menu: document page scroll is locked and pointer interactions on outside elements are disabled.
   * - `false`: user interaction with the rest of the document is allowed.
   *
   * On touch devices, a `true` modal blocks outside taps but leaves the page scrollable unless the popup spans nearly the full viewport width, matching native iOS behavior.
   *
   * Nested menus ignore this prop, and menus opened by hover are never modal.
   * @default true
   */
  modal?: boolean | undefined;
  /**
   * Event handler called when the menu is opened or closed.
   */
  onOpenChange?: ((open: boolean, eventDetails: MenuRoot.ChangeEventDetails) => void) | undefined;
  /**
   * Event handler called after any animations complete when the menu is opened or closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Callback fired when an item is highlighted or unhighlighted.
   * Receives the highlighted item element (or `undefined` if no item is highlighted) and details
   * containing the reason for the change, the event, and the item's text label.
   * The `reason` can be:
   * - `'keyboard'`: the highlight changed due to keyboard navigation.
   * - `'pointer'`: the highlight changed due to pointer hovering. The event may be a `MouseEvent`
   *   rather than a `PointerEvent`.
   * - `'none'`: the highlight changed for another reason, such as automatic highlighting while
   *   filtering, the item list changing, or the popup opening or closing.
   */
  onItemHighlighted?:
    | ((
        highlightedItem: HTMLElement | undefined,
        eventDetails: MenuRoot.HighlightEventDetails,
      ) => void)
    | undefined;
  /**
   * Whether the menu is currently open.
   */
  open?: boolean | undefined;
  /**
   * The visual orientation of the menu.
   * Controls whether roving focus uses up/down or left/right arrow keys.
   * @default 'vertical'
   */
  orientation?: MenuRoot.Orientation | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * When in a submenu, determines whether pressing the Escape key
   * closes the entire menu, or only the current child menu.
   * @default false
   */
  closeParentOnEsc?: boolean | undefined;
  /**
   * A ref to imperative actions.
   * - `unmount`: Ends the closing phase of the menu after an externally controlled closing animation finishes.
   *   Call `preventUnmountOnClose()` in `onOpenChange` first, otherwise the menu completes closing on its own.
   *   Whether it leaves the DOM is decided by `keepMounted` on the portal.
   * - `close`: Closes the menu imperatively when called.
   */
  actionsRef?: { current: MenuRoot.Actions | null } | undefined;
  /**
   * ID of the trigger that the menu is associated with.
   * This is useful in conjunction with the `open` prop to create a controlled menu.
   * There's no need to specify this prop when the menu is uncontrolled (that is, when the `open` prop is not set).
   */
  triggerId?: string | null | undefined;
  /**
   * ID of the trigger that the menu is associated with.
   * This is useful in conjunction with the `defaultOpen` prop to create an initially open menu.
   */
  defaultTriggerId?: string | null | undefined;
  /**
   * A handle to associate the menu with a trigger.
   * If specified, allows external triggers to control the menu's open state.
   */
  handle?: MenuHandle<Payload> | undefined;
  /**
   * The content of the menu.
   * This can be a regular element or a render function that receives the `payload` of the active trigger.
   */
  children?: JSX.Element | PayloadChildRenderFunction<Payload>;
}

export interface MenuRootActions {
  unmount: () => void;
  close: () => void;
}

export type MenuRootChangeEventReason =
  | typeof REASONS.triggerHover
  | typeof REASONS.triggerFocus
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.focusOut
  | typeof REASONS.listNavigation
  | typeof REASONS.escapeKey
  | typeof REASONS.itemPress
  | typeof REASONS.closePress
  | typeof REASONS.siblingOpen
  | typeof REASONS.cancelOpen
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;

export type MenuRootChangeEventDetails = BaseUIChangeEventDetails<MenuRoot.ChangeEventReason> & {
  /** Prevents the popup from unmounting until the `unmount` action is called. */
  preventUnmountOnClose: () => void;
};

export type MenuRootHighlightEventReason =
  typeof REASONS.keyboard | typeof REASONS.pointer | typeof REASONS.none;

export type MenuRootHighlightEventDetails = BaseUIHighlightEventDetails<
  MenuRoot.HighlightEventReason,
  {
    /**
     * The highlighted item's `label` prop, or its text content when the prop is not set.
     */
    label: string | undefined;
  }
>;

export type MenuRootOrientation = 'horizontal' | 'vertical';

export type MenuParent =
  | {
      type: 'menu';
      store: MenuStore<unknown>;
    }
  | {
      type: 'menubar';
      context: MenubarContext;
    }
  | {
      type: 'context-menu';
      context: ContextMenuRootContext;
    }
  | {
      type: 'nested-context-menu';
      context: ContextMenuRootContext;
      menuContext: MenuRootContext;
    }
  | {
      type: undefined;
    };

export namespace MenuRoot {
  export type State = MenuRootState;
  export type Props<Payload = unknown> = MenuRootProps<Payload>;
  export type Actions = MenuRootActions;
  export type ChangeEventReason = MenuRootChangeEventReason;
  export type ChangeEventDetails = MenuRootChangeEventDetails;
  export type HighlightEventReason = MenuRootHighlightEventReason;
  export type HighlightEventDetails = MenuRootHighlightEventDetails;
  export type Orientation = MenuRootOrientation;
}
