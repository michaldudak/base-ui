import { createMemo, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import { useAnimationFrame } from '#utils/useAnimationFrame';
import { useEffect, useIsoLayoutEffect, useExternalEffect } from '#utils/useEffect';
import { ownerDocument } from '#utils/owner';
import { platform } from '#utils/platform';
import { activeElement, contains, getTarget } from '#utils/shadowDom';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { EMPTY_OBJECT } from '#utils/empty';
import { isElement, isHTMLElement } from '@floating-ui/utils/dom';
import { createChangeEventDetails } from '../../../internals/createBaseUIEventDetails';
import { REASONS } from '../../../internals/reasons';
import type { HTMLProps } from '../../../internals/types';
import { useFloatingParentNodeId, useFloatingTree } from '../tree/FloatingTree';
import type { FloatingTreeStore } from '../tree/FloatingTreeStore';
import type { PopupInteractionStore } from '../types';
import {
  getMaxListIndex,
  getMinListIndex,
  getNextListIndex,
  isIndexOutOfListBounds,
} from '../../../internals/composite/listIndex';
import type { DisabledIndices } from '../../../internals/composite/listIndex';
import type { gridNavigation } from './gridNavigation';
import { ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, ARROW_UP } from '../constants';
import { getFloatingFocusElement, isTypeableCombobox, isTypeableElement } from '../element';
import { enqueueFocus } from '../focus/enqueueFocus';
import { isVirtualClick, isVirtualPointerEvent, stopEvent } from '../event';

type Orientation = 'vertical' | 'horizontal' | 'both';

type WithCurrentTarget<E extends Event, T extends Element = HTMLElement> = E & {
  currentTarget: T;
};

// WebKit fires zero-delta `mousemove`/`pointermove` events when the list scrolls
// beneath a stationary pointer, moving the highlight during keyboard navigation.
// https://github.com/mui/base-ui/issues/4002
function isStationaryWebKitPointer(event: MouseEvent | PointerEvent) {
  return platform.engine.webkit && event.movementX === 0 && event.movementY === 0;
}

function doSwitch(orientation: Orientation | undefined, vertical: boolean, horizontal: boolean) {
  switch (orientation) {
    case 'vertical':
      return vertical;
    case 'horizontal':
      return horizontal;
    default:
      return vertical || horizontal;
  }
}

export function isMainOrientationKey(key: string, orientation: Orientation | undefined) {
  const vertical = key === ARROW_UP || key === ARROW_DOWN;
  const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal);
}

export function isMainOrientationToEndKey(
  key: string,
  orientation: Orientation | undefined,
  rtl: boolean,
) {
  const vertical = key === ARROW_DOWN;
  const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  return (
    doSwitch(orientation, vertical, horizontal) || key === 'Enter' || key === ' ' || key === ''
  );
}

export function isCrossOrientationOpenKey(
  key: string,
  orientation: Orientation | undefined,
  rtl: boolean,
) {
  const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  const horizontal = key === ARROW_DOWN;
  return doSwitch(orientation, vertical, horizontal);
}

export function isCrossOrientationCloseKey(
  key: string,
  orientation: Orientation | undefined,
  rtl: boolean,
  grid: boolean,
) {
  const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
  const horizontal = key === ARROW_UP;
  if (orientation === 'both' || (orientation === 'horizontal' && grid)) {
    return key === 'Escape';
  }
  return doSwitch(orientation, vertical, horizontal);
}

export interface UseListNavigationProps {
  /**
   * A ref that holds an array of list items.
   * @default empty list
   */
  listRef: { current: Array<HTMLElement | null> };
  /**
   * The index of the currently active (focused or highlighted) item, which may
   * or may not be selected.
   * @default null
   */
  activeIndex: MaybeAccessor<number | null>;
  /**
   * A callback that is called when the user navigates to a new active item,
   * passed in a new `activeIndex`.
   */
  onNavigate?: ((activeIndex: number | null, event: Event | undefined) => void) | undefined;
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined>;
  /**
   * The currently selected item index, which may or may not be active.
   * @default null
   */
  selectedIndex?: MaybeAccessor<number | null | undefined>;
  /**
   * Whether to focus the item upon opening the floating element. 'auto' infers
   * what to do based on the input type (keyboard vs. pointer), while a boolean
   * value will force the value.
   * @default 'auto'
   */
  focusItemOnOpen?: MaybeAccessor<boolean | 'auto' | undefined>;
  /**
   * Whether hovering an item synchronizes the focus.
   * @default true
   */
  focusItemOnHover?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether pressing an arrow key on the navigation's main axis opens the
   * floating element.
   * @default true
   */
  openOnArrowKeyDown?: MaybeAccessor<boolean | undefined>;
  /**
   * By default elements with either a `disabled` or `aria-disabled` attribute
   * are skipped in the list navigation — however, this requires the items to
   * be rendered.
   * This prop allows you to manually specify indices which should be disabled,
   * overriding the default logic.
   * For Windows-style select popups, where the menu does not open when
   * navigating via arrow keys, specify an empty array.
   *
   * Solid port: a predicate must be wrapped in an accessor (`() => predicate`), since a bare
   * function is read as an accessor.
   * @default undefined
   */
  disabledIndices?: ReadonlyArray<number> | Accessor<DisabledIndices | undefined> | undefined;
  /**
   * Determines whether focus can escape the list, such that nothing is selected
   * after navigating beyond the boundary of the list. In some
   * autocomplete/combobox components, this may be desired, as screen
   * readers will return to the input.
   * `loopFocus` must be `true`.
   * @default false
   */
  allowEscape?: MaybeAccessor<boolean | undefined>;
  /**
   * Determines whether focus should loop around when navigating past the first
   * or last item.
   * @default false
   */
  loopFocus?: MaybeAccessor<boolean | undefined>;
  /**
   * If the list is nested within another one (e.g. a nested submenu), the
   * navigation semantics change.
   * @default false
   */
  nested?: MaybeAccessor<boolean | undefined>;
  /**
   * Allows to specify the orientation of the parent list, which is used to
   * determine the direction of the navigation.
   * This is useful when list navigation is used within a Composite,
   * as the hook can't determine the orientation of the parent list automatically.
   */
  parentOrientation?: MaybeAccessor<Orientation | undefined>;
  /**
   * Whether the direction of the floating element's navigation is in RTL
   * layout.
   * @default false
   */
  rtl?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether the focus is virtual (using `aria-activedescendant`).
   * Use this if you need focus to remain on the reference element
   * (such as an input), but allow arrow keys to navigate list items.
   * This is common in autocomplete listbox components.
   * Your virtually-focused list items must have a unique `id` set on them.
   * @default false
   */
  virtual?: MaybeAccessor<boolean | undefined>;
  /**
   * The orientation in which navigation occurs.
   * @default 'vertical'
   */
  orientation?: MaybeAccessor<Orientation | undefined>;
  /**
   * The orientation used to open the list from its trigger.
   * @default orientation
   */
  triggerOrientation?: MaybeAccessor<Orientation | undefined>;
  /**
   * The id of the root component.
   */
  id?: MaybeAccessor<string | undefined>;
  /**
   * Whether to clear the active index when the pointer leaves an item.
   * @default true
   */
  resetOnPointerLeave?: MaybeAccessor<boolean | undefined>;
  /**
   * External FloatingTree to use when the one provided by context can't be used.
   */
  externalTree?: FloatingTreeStore | undefined;
  /**
   * Focus target used when a nested list returns to a virtually focused parent.
   */
  nestedReturnFocusRef?: { current: HTMLElement | null } | undefined;
  /**
   * Computes two-dimensional list navigation for grid-capable consumers.
   * Read when it is used (not through an accessor, since it is a function itself).
   */
  grid?: typeof gridNavigation | null | undefined;
  /**
   * Whether Tab closes the open list the same way Shift+Tab does.
   * @default false
   */
  closeOnTab?: MaybeAccessor<boolean | undefined>;
}

export interface UseListNavigationReturnValue {
  reference: Accessor<HTMLProps>;
  floating: Accessor<HTMLProps>;
  item: Accessor<HTMLProps>;
  trigger: Accessor<HTMLProps>;
}

/**
 * Adds arrow key-based navigation of a list of items, either using real DOM
 * focus or virtual focus.
 * @see https://floating-ui.com/docs/useListNavigation
 */
export function useListNavigation(
  store: PopupInteractionStore,
  props: UseListNavigationProps,
): UseListNavigationReturnValue {
  const listRef = props.listRef;
  const activeIndex = () => access(props.activeIndex);
  const onNavigateProp = (index: number | null, event: Event | undefined) =>
    props.onNavigate?.(index, event);
  const enabled = () => access(props.enabled) ?? true;
  const selectedIndex = () => access(props.selectedIndex) ?? null;
  const allowEscape = () => access(props.allowEscape) ?? false;
  const loopFocus = () => access(props.loopFocus) ?? false;
  const nested = () => access(props.nested) ?? false;
  const rtl = () => access(props.rtl) ?? false;
  const virtual = () => access(props.virtual) ?? false;
  const focusItemOnOpen = () => access(props.focusItemOnOpen) ?? 'auto';
  const focusItemOnHover = () => access(props.focusItemOnHover) ?? true;
  const openOnArrowKeyDown = () => access(props.openOnArrowKeyDown) ?? true;
  const disabledIndices = (): DisabledIndices | undefined => {
    const value = props.disabledIndices;
    return typeof value === 'function' ? value() : value;
  };
  const orientation = () => access(props.orientation) ?? 'vertical';
  const triggerOrientation = () => access(props.triggerOrientation) ?? orientation();
  const parentOrientation = () => access(props.parentOrientation);
  const id = () => access(props.id);
  const resetOnPointerLeave = () => access(props.resetOnPointerLeave) ?? true;
  const externalTree = untrack(() => props.externalTree);
  const nestedReturnFocusRef = props.nestedReturnFocusRef;
  const closeOnTab = () => access(props.closeOnTab) ?? false;

  const isGrid = () => props.grid != null;

  if (process.env.NODE_ENV !== 'production') {
    // React checks these on every render; here, whenever one of them changes.
    useEffect(
      () => [allowEscape(), loopFocus(), virtual(), orientation(), isGrid()] as const,
      ([isAllowEscape, isLoopFocus, isVirtual, currentOrientation, isGridNavigation]) => {
        if (isAllowEscape) {
          if (!isLoopFocus) {
            console.warn('`useListNavigation` looping must be enabled to allow escaping.');
          }

          if (!isVirtual) {
            console.warn('`useListNavigation` must be virtual to allow escaping.');
          }
        }

        if (currentOrientation === 'vertical' && isGridNavigation) {
          console.warn(
            'In grid list navigation mode, the `orientation` should',
            'be either "horizontal" or "both".',
          );
        }
      },
    );
  }

  const open = store.useState('open');
  const positionerElement = store.useState('positionerElement');
  const anchorElement = store.useState('anchorElement');

  const storeContext = store.context;

  const floatingFocusElement = createMemo(() => getFloatingFocusElement(positionerElement()));
  const typeableComboboxReference = createMemo(() => isTypeableCombobox(anchorElement()));

  const parentId = useFloatingParentNodeId();
  const tree = useFloatingTree(externalTree);

  // The initial values are read once, like React's `useRef` initializers.
  const focusItemOnOpenRef: { current: boolean | 'auto' } = {
    current: untrack(focusItemOnOpen),
  };
  const indexRef = { current: untrack(() => selectedIndex() ?? -1) };
  const keyRef: { current: null | string } = { current: null };
  const isPointerModalityRef = { current: true };

  const onNavigate = (event?: Event) => {
    onNavigateProp(indexRef.current === -1 ? null : indexRef.current, event);
  };

  const forceSyncFocusRef = { current: false };
  const forceScrollIntoViewRef = { current: false };
  const cancelQueuedFocusRef: { current: (() => void) | null } = { current: null };

  const focusFrame = useAnimationFrame();
  const waitForListPopulatedFrame = useAnimationFrame();

  // `isVirtual` is passed in by the caller: effects call this function and must not read
  // accessors outside their dependency function.
  const focusItem = (isVirtual: boolean) => {
    // Synchronous navigation must also supersede any deferred focus from an earlier update.
    focusFrame.cancel();

    function runFocus(element: HTMLElement) {
      if (!isVirtual) {
        cancelQueuedFocusRef.current = enqueueFocus(element, {
          sync: forceSyncFocusRef.current,
          preventScroll: true,
        });
      }
    }

    const initialItem = listRef.current[indexRef.current];
    const forceScrollIntoView = forceScrollIntoViewRef.current;

    if (initialItem) {
      runFocus(initialItem);
    }

    const scheduler = forceSyncFocusRef.current
      ? (callback: () => void) => callback()
      : (callback: () => void) => focusFrame.request(callback);

    scheduler(() => {
      const waitedItem = listRef.current[indexRef.current] || initialItem;

      if (!waitedItem) {
        return;
      }

      if (!initialItem) {
        runFocus(waitedItem);
      }

      // React also tested the (always defined) `item` props object here; it is dropped because
      // the condition never depended on it.
      const shouldScrollIntoView = forceScrollIntoView || !isPointerModalityRef.current;

      if (shouldScrollIntoView) {
        // JSDOM doesn't support `.scrollIntoView()` but it's widely supported
        // by all browsers.
        waitedItem.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
    });
  };

  useIsoLayoutEffect(
    () => [orientation()] as const,
    ([currentOrientation]) => {
      storeContext.orientation = currentOrientation;
    },
  );

  // Reset on its own: an explicit `focusItemOnOpen` can change one render before `open` does,
  // which must not discard the key the trigger just recorded.
  useIsoLayoutEffect(
    () => [open()] as const,
    ([isOpen]) => {
      if (!isOpen) {
        keyRef.current = null;
      }
    },
  );

  useIsoLayoutEffect(
    () => [open(), focusItemOnOpen()] as const,
    ([isOpen, currentFocusItemOnOpen]) => {
      // Explicit values can change with the opening interaction. Keep an inferred 'auto' value
      // from the trigger event, but apply a boolean before the initial highlight is synchronized.
      if (!isOpen || currentFocusItemOnOpen !== 'auto') {
        focusItemOnOpenRef.current = currentFocusItemOnOpen;
      }
    },
  );

  // Sync `selectedIndex` to be the `activeIndex` upon opening the floating
  // element. Also, reset `activeIndex` upon closing the floating element.
  useIsoLayoutEffect(
    () => [enabled(), open(), positionerElement(), selectedIndex()] as const,
    ([isEnabled, isOpen, currentPositionerElement, currentSelectedIndex], previous) => {
      if (!isEnabled) {
        return;
      }
      // Solid port: React keeps "was it mounted after the last render" in a ref that a last
      // effect updates. Effects don't run in declaration order here, so each effect takes the
      // previous values of its own dependencies instead.
      const wasMounted = previous ? !!previous[2] : !!currentPositionerElement;

      if (isOpen && currentPositionerElement) {
        indexRef.current = currentSelectedIndex ?? -1;
        if (focusItemOnOpenRef.current && currentSelectedIndex != null) {
          // Regardless of the pointer modality, we want to ensure the selected
          // item comes into view when the floating element is opened.
          forceScrollIntoViewRef.current = true;
          onNavigate();
        }
      } else if (wasMounted) {
        // Reset the active index when the list is no longer open and mounted (closing or
        // unmounting). `onNavigate` always forwards to the latest `onNavigate` prop.
        indexRef.current = -1;
        onNavigate();
      }
    },
  );

  // Highlight an item when the floating element opens from the keyboard.
  // Solid port: in React this is part of the effect below. It is its own effect here because it
  // writes `activeIndex` (through `onNavigate`), and an effect must not depend on what it writes.
  // Which item to highlight depends on the items the list has rendered, so this reports from the
  // DOM rather than deriving a value.
  useExternalEffect(
    () =>
      [
        enabled(),
        open(),
        positionerElement(),
        nested(),
        triggerOrientation(),
        rtl(),
        // Read when the effect runs, without re-running it.
        untrack(activeIndex),
        untrack(selectedIndex),
      ] as const,
    (
      [
        isEnabled,
        isOpen,
        currentPositionerElement,
        isNested,
        currentTriggerOrientation,
        isRtl,
        currentActiveIndex,
        currentSelectedIndex,
      ],
      previous,
    ) => {
      if (
        !isEnabled ||
        !isOpen ||
        !currentPositionerElement ||
        currentActiveIndex != null ||
        currentSelectedIndex != null
      ) {
        return;
      }
      const wasOpen = previous ? previous[1] : isOpen;
      const wasMounted = previous ? !!previous[2] : !!currentPositionerElement;

      // Initial sync.
      if (
        (!wasOpen || !wasMounted) &&
        focusItemOnOpenRef.current &&
        (keyRef.current != null || (focusItemOnOpenRef.current === true && keyRef.current == null))
      ) {
        let runs = 0;
        const waitForListPopulated = () => {
          if (listRef.current[0] == null) {
            // Avoid letting the browser paint if possible on the first try,
            // otherwise use rAF. Don't try more than twice, since something
            // is wrong otherwise.
            // Solid port: the list resolves its items from its own effect, which runs after
            // this one (a parent's effects run first), so the first retry usually finds them.
            if (runs < 2) {
              const scheduler = runs
                ? (callback: () => void) => waitForListPopulatedFrame.request(callback)
                : queueMicrotask;
              scheduler(waitForListPopulated);
            }
            runs += 1;
          } else {
            // Initially focus the first non-disabled item. `disabledIndices` is deliberately
            // omitted here so attribute-disabled items (`disabled`/`aria-disabled`) are skipped
            // on open even when the consumer passes an empty `disabledIndices` array. Passing it
            // would regress that behavior (see mui/base-ui#2604).
            // The key came from the trigger, so it is read on the trigger's orientation.
            indexRef.current =
              keyRef.current == null ||
              isMainOrientationToEndKey(keyRef.current, currentTriggerOrientation, isRtl) ||
              isNested
                ? getMinListIndex(listRef)
                : getMaxListIndex(listRef);
            keyRef.current = null;
            onNavigate();
          }
        };

        waitForListPopulated();
      }
    },
  );

  // Sync `activeIndex` to be the focused item while the floating element is
  // open.
  useIsoLayoutEffect(
    () =>
      [
        enabled(),
        open(),
        positionerElement(),
        activeIndex(),
        // Read when the effect runs, without re-running it (React read them from refs or a
        // stable callback).
        untrack(selectedIndex),
        untrack(virtual),
      ] as const,
    (
      [
        isEnabled,
        isOpen,
        currentPositionerElement,
        currentActiveIndex,
        currentSelectedIndex,
        isVirtual,
      ],
      previous,
    ) => {
      if (!isEnabled) {
        return;
      }
      const wasMounted = previous ? !!previous[2] : !!currentPositionerElement;
      if (!isOpen) {
        forceSyncFocusRef.current = false;
        return;
      }
      if (!currentPositionerElement) {
        return;
      }

      if (currentActiveIndex == null) {
        forceSyncFocusRef.current = false;

        if (currentSelectedIndex != null) {
          return;
        }

        // Reset while the floating element was open (e.g. the list changed).
        if (wasMounted) {
          indexRef.current = -1;
          focusItem(isVirtual);
        }
      } else if (!isIndexOutOfListBounds(listRef.current, currentActiveIndex)) {
        indexRef.current = currentActiveIndex;
        focusItem(isVirtual);
        forceScrollIntoViewRef.current = false;
      }
    },
  );

  // Ensure the parent floating element has focus when a nested child closes
  // to allow arrow key navigation to work after the pointer leaves the child.
  useIsoLayoutEffect(
    () => [enabled(), positionerElement(), anchorElement(), access(parentId), virtual()] as const,
    (
      [isEnabled, currentPositionerElement, currentAnchorElement, currentParentId, isVirtual],
      previous,
    ) => {
      if (!isEnabled || currentPositionerElement || !tree || isVirtual || !previous?.[1]) {
        return;
      }

      const nodes = tree.nodesRef.current;
      const parent = nodes.find((node) => node.id === currentParentId)?.context?.elements.floating;
      // `positionerElement` is null here (see the guard above), so resolve the owner document
      // from an in-DOM element for realm-safety (shadow DOM/iframes): the reference element, falling
      // back to the parent floating element when the reference is virtual (`anchorElement` is null).
      const activeEl = activeElement(ownerDocument(currentAnchorElement ?? parent ?? null));
      const treeContainsActiveEl = nodes.some(
        (node) => node.context && contains(node.context.elements.floating, activeEl),
      );

      if (parent && !treeContainsActiveEl && isPointerModalityRef.current) {
        parent.focus({ preventScroll: true });
      }
    },
  );

  const hasActiveIndex = () => activeIndex() != null;

  const syncCurrentTarget = (event: WithCurrentTarget<Event>) => {
    if (!open()) {
      return;
    }

    const index = listRef.current.indexOf(event.currentTarget);
    if (index !== -1 && (indexRef.current !== index || activeIndex() !== index)) {
      indexRef.current = index;
      onNavigate(event);
    }
  };

  const getParentOrientation = () => {
    return (
      parentOrientation() ??
      tree?.nodesRef.current.find((node) => node.id === access(parentId))?.context?.rootStore
        .context.orientation
    );
  };

  const getMinEnabledIndex = () => {
    return getMinListIndex(listRef, disabledIndices());
  };

  const commonOnKeyDown = (event: WithCurrentTarget<KeyboardEvent, Element>) => {
    isPointerModalityRef.current = false;
    forceSyncFocusRef.current = true;

    // When composing a character, Chrome fires ArrowDown twice. Firefox/Safari
    // don't appear to suffer from this. `event.isComposing` is avoided due to
    // Safari not supporting it properly (although it's not needed in the first
    // place for Safari, just avoiding any possible issues).
    if (event.which === 229) {
      return;
    }

    // If the floating element is animating out, ignore navigation. Otherwise,
    // the `activeIndex` gets set to 0 despite not being open so the next time
    // the user ArrowDowns, the first item won't be focused.
    if (!open() && event.currentTarget === floatingFocusElement()) {
      return;
    }

    const currentOrientation = orientation();
    const isRtl = rtl();

    if (nested() && isCrossOrientationCloseKey(event.key, currentOrientation, isRtl, isGrid())) {
      // If the nested list's close key is also the parent navigation key,
      // let the parent navigate. Otherwise, stop propagating the event.
      if (!isMainOrientationKey(event.key, getParentOrientation())) {
        stopEvent(event);
      }

      store.setOpen(false, createChangeEventDetails(REASONS.listNavigation, event));

      const returnElement = nestedReturnFocusRef?.current ?? anchorElement();
      if (isHTMLElement(returnElement)) {
        returnElement.focus();
      }

      return;
    }

    const currentActiveIndex = activeIndex();

    // The consumer owns `activeIndex` and may decline a navigation this hook proposed, such as a
    // virtual list keeping its highlight when the reference is refocused. Declining produces no
    // re-render, so reconcile here: otherwise the cursor drifts from the rendered highlight and
    // this key moves from the wrong position.
    if (
      currentActiveIndex != null &&
      currentActiveIndex !== indexRef.current &&
      !isIndexOutOfListBounds(listRef.current, currentActiveIndex)
    ) {
      indexRef.current = currentActiveIndex;
    }

    const currentDisabledIndices = disabledIndices();
    const isLoopFocus = loopFocus();
    const currentIndex = indexRef.current;
    const minIndex = getMinListIndex(listRef, currentDisabledIndices);
    const maxIndex = getMaxListIndex(listRef, currentDisabledIndices);

    if (!typeableComboboxReference()) {
      if (event.key === 'Home') {
        stopEvent(event);
        indexRef.current = minIndex;
        onNavigate(event);
      }

      if (event.key === 'End') {
        stopEvent(event);
        indexRef.current = maxIndex;
        onNavigate(event);
      }
    }

    // Grid navigation is injected by grid-capable consumers so non-grid
    // consumers (menu, select) tree-shake the grid helpers out.
    const navigateGrid = props.grid;
    if (navigateGrid != null) {
      const index = navigateGrid(
        event,
        indexRef.current,
        listRef,
        currentOrientation,
        isLoopFocus,
        isRtl,
        currentDisabledIndices,
        minIndex,
        maxIndex,
      );

      // The grid navigator returns the unchanged index for keys it does not handle, and
      // reporting that as a navigation would re-emit the current highlight on every keydown.
      if (index != null && index !== indexRef.current) {
        indexRef.current = index;
        onNavigate(event);
      }

      if (currentOrientation === 'both') {
        return;
      }
    }

    if (isMainOrientationKey(event.key, currentOrientation)) {
      stopEvent(event);

      const isVirtual = virtual();

      // Reset the index if no item is focused. Focus can also rest on a container inside the
      // popup, such as a list that holds the `menu` role. Keys bubbling from a portaled nested
      // popup are not in this popup's DOM, so they navigate from the current index.
      const focusedElement = activeElement(event.currentTarget.ownerDocument);
      if (
        open() &&
        !isVirtual &&
        contains(event.currentTarget, focusedElement) &&
        !listRef.current.some((element) => element != null && contains(element, focusedElement))
      ) {
        indexRef.current = isMainOrientationToEndKey(event.key, currentOrientation, isRtl)
          ? minIndex
          : maxIndex;
        onNavigate(event);
        // The boundary item may already be highlighted, so `activeIndex` won't change and the
        // effect that moves focus to the highlighted item won't run.
        if (currentActiveIndex === indexRef.current) {
          focusItem(isVirtual);
        }
        return;
      }

      const { index, wrapped } = getNextListIndex(listRef.current, currentIndex, {
        decrement: !isMainOrientationToEndKey(event.key, currentOrientation, isRtl),
        loopFocus: isLoopFocus,
        allowEscape: allowEscape(),
        disabledIndices: currentDisabledIndices,
        minIndex,
        maxIndex,
      });
      if (wrapped) {
        // Give time for virtualizers to update the listRef.
        forceSyncFocusRef.current = false;
      }
      indexRef.current = index;

      onNavigate(event);
    }
  };

  const itemProps: HTMLProps = {
    onFocus(event: WithCurrentTarget<FocusEvent>) {
      forceSyncFocusRef.current = true;
      syncCurrentTarget(event);
    },
    onMouseMove(event: WithCurrentTarget<MouseEvent>) {
      if (isStationaryWebKitPointer(event)) {
        return;
      }
      forceSyncFocusRef.current = true;
      forceScrollIntoViewRef.current = false;
      if (focusItemOnHover()) {
        syncCurrentTarget(event);
      }
    },
    onPointerLeave(event: WithCurrentTarget<PointerEvent>) {
      if (!open() || !isPointerModalityRef.current || event.pointerType === 'touch') {
        return;
      }

      forceSyncFocusRef.current = true;

      if (!resetOnPointerLeave()) {
        return;
      }

      const relatedTarget = isElement(event.relatedTarget) ? event.relatedTarget : null;
      if (
        !focusItemOnHover() ||
        listRef.current.some((element) => contains(element, relatedTarget))
      ) {
        return;
      }

      cancelQueuedFocusRef.current?.();
      cancelQueuedFocusRef.current = null;

      indexRef.current = -1;
      onNavigate(event);

      if (!virtual()) {
        const floatingFocusEl = floatingFocusElement();
        const activeEl = activeElement(ownerDocument(floatingFocusEl));
        if (floatingFocusEl && contains(floatingFocusEl, activeEl)) {
          floatingFocusEl.focus({ preventScroll: true });
        }
      }
    },
  };

  const item = createMemo<HTMLProps>(() => (enabled() ? itemProps : (EMPTY_OBJECT as HTMLProps)));

  const ariaActiveDescendantProp = createMemo(() => {
    return (
      virtual() &&
      open() &&
      hasActiveIndex() && {
        'aria-activedescendant': `${id()}-${activeIndex()}`,
      }
    );
  });

  const floatingHandlers: HTMLProps = {
    onKeyDown(event: WithCurrentTarget<KeyboardEvent>) {
      // Close on Shift+Tab, and on Tab when `closeOnTab` is set.
      if (event.key === 'Tab' && (event.shiftKey || closeOnTab()) && open() && !virtual()) {
        // If the event originated from within a nested element (e.g., a Dialog opened from
        // within the menu), don't close the menu. The nested element has its own focus
        // management and should handle the Tab key.
        const target = getTarget(event) as Element | null;
        if (target && !contains(floatingFocusElement(), target)) {
          return;
        }

        stopEvent(event);
        const details = createChangeEventDetails(REASONS.focusOut, event);
        store.setOpen(false, details);

        const returnElement = nestedReturnFocusRef?.current ?? anchorElement();
        if (!details.isCanceled && isHTMLElement(returnElement)) {
          returnElement.focus();
        }

        return;
      }

      commonOnKeyDown(event);
    },
    onPointerMove(event: PointerEvent) {
      if (isStationaryWebKitPointer(event)) {
        return;
      }
      isPointerModalityRef.current = true;
    },
  };

  const floating = createMemo<HTMLProps>(() => {
    if (!enabled()) {
      return EMPTY_OBJECT as HTMLProps;
    }
    return {
      ...(!typeableComboboxReference() ? ariaActiveDescendantProp() : {}),
      ...floatingHandlers,
    };
  });

  function openOnNavigationKeyDown(event: WithCurrentTarget<KeyboardEvent, Element>) {
    store.setOpen(
      true,
      createChangeEventDetails(REASONS.listNavigation, event, event.currentTarget),
    );
  }

  function checkVirtualMouse(event: MouseEvent) {
    if (focusItemOnOpen() === 'auto' && isVirtualClick(event)) {
      focusItemOnOpenRef.current = !virtual();
    }
  }

  function checkVirtualPointer(event: PointerEvent) {
    const currentFocusItemOnOpen = focusItemOnOpen();
    // `pointerdown` fires first, reset the state then perform the checks.
    focusItemOnOpenRef.current = currentFocusItemOnOpen;
    if (currentFocusItemOnOpen === 'auto' && isVirtualPointerEvent(event)) {
      focusItemOnOpenRef.current = true;
    }
  }

  const triggerProps: HTMLProps = {
    onKeyDown(event: WithCurrentTarget<KeyboardEvent, Element>) {
      // non-reactive open state (to prevent re-creation of the handler)
      const currentOpen = store.select('open');
      isPointerModalityRef.current = false;

      const isNested = nested();
      const isVirtual = virtual();
      const isArrowKey = event.key.startsWith('Arrow');
      const isParentCrossOpenKey = isCrossOrientationOpenKey(
        event.key,
        getParentOrientation(),
        rtl(),
      );
      const isMainKey = isMainOrientationKey(
        event.key,
        currentOpen ? orientation() : triggerOrientation(),
      );
      const isNavigationKey =
        (isNested ? isParentCrossOpenKey : isMainKey) ||
        event.key === 'Enter' ||
        event.key.trim() === '';

      if (isVirtual && currentOpen && (!isNested || isTypeableElement(event.currentTarget))) {
        return commonOnKeyDown(event);
      }

      // If a floating element should not open on arrow key down, avoid
      // setting `activeIndex` while it's closed.
      if (!currentOpen && !openOnArrowKeyDown() && isArrowKey) {
        return undefined;
      }

      if (isNavigationKey) {
        const isParentMainKey = isMainOrientationKey(event.key, getParentOrientation());
        keyRef.current = isNested && isParentMainKey ? null : event.key;
      }

      if (isNested) {
        if (isParentCrossOpenKey) {
          stopEvent(event);

          if (currentOpen) {
            indexRef.current = getMinEnabledIndex();
            onNavigate(event);
            if (isVirtual) {
              floatingFocusElement()?.focus();
            }
          } else {
            openOnNavigationKeyDown(event);
          }
        }

        return undefined;
      }

      if (isMainKey) {
        const currentSelectedIndex = selectedIndex();
        if (currentSelectedIndex != null) {
          indexRef.current = currentSelectedIndex;
        }

        stopEvent(event);

        if (!currentOpen && openOnArrowKeyDown()) {
          openOnNavigationKeyDown(event);
        } else {
          commonOnKeyDown(event);
        }

        if (currentOpen) {
          onNavigate(event);
        }
      }

      return undefined;
    },
    onFocus(event: FocusEvent) {
      if (event.target !== event.currentTarget) {
        return;
      }

      if (store.select('open') && !virtual()) {
        indexRef.current = -1;
        onNavigate(event);
      }
    },
    onPointerDown: checkVirtualPointer,
    onPointerEnter: checkVirtualPointer,
    onMouseDown: checkVirtualMouse,
    onClick: checkVirtualMouse,
  };

  const trigger = createMemo<HTMLProps>(() =>
    enabled() ? triggerProps : (EMPTY_OBJECT as HTMLProps),
  );

  const reference = createMemo<HTMLProps>(() => {
    if (!enabled()) {
      return EMPTY_OBJECT as HTMLProps;
    }
    return {
      ...ariaActiveDescendantProp(),
      ...triggerProps,
    };
  });

  return { reference, floating, item, trigger };
}
