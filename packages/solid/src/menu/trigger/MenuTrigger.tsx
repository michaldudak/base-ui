import { createMemo, createSignal, omit, onCleanup, Show, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useTimeout } from '#utils/useTimeout';
import { ownerDocument } from '#utils/owner';
import { useEffect, useIsoLayoutEffect } from '#utils/useEffect';
import { EMPTY_OBJECT } from '#utils/empty';
import { contains, getTarget } from '#utils/shadowDom';
import { safePolygon } from '../../utils/popups/interactions/safePolygon';
import { useClick } from '../../utils/popups/interactions/useClick';
import {
  useFloatingTree,
  useFloatingNodeId,
  useFloatingParentNodeId,
} from '../../utils/popups/tree/FloatingTree';
import { useFocus } from '../../utils/popups/interactions/useFocus';
import { useHoverTriggerInteraction } from '../../utils/popups/interactions/useHoverTriggerInteraction';
import type { FloatingTreeStore } from '../../utils/popups/tree/FloatingTreeStore';
import { useMenuRootContext } from '../root/MenuRootContext';
import { pressableTriggerOpenStateMapping } from '../../utils/popups/popupStateMapping';
import { useRenderElement } from '../../internals/useRenderElement';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { useButton } from '../../internals/use-button/useButton';
import { isMouseWithinBounds } from '../../utils/getPseudoElementBounds';
import { CompositeItem } from '../../internals/composite/item/CompositeItem';
import { useCompositeRootContext } from '../../internals/composite/root/CompositeRootContext';
import { findRootOwnerId } from '../utils/findRootOwnerId';
import { usePopupHandleStore } from '../../utils/popups/usePopupHandleStore';
import { useTriggerDataForwarding } from '../../utils/popups/popupStoreUtils';
import { useTriggerFocusGuards } from '../../utils/popups/useTriggerFocusGuards';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { REASONS } from '../../internals/reasons';
import { useMixedToggleClickHandler } from './useMixedToggleClickHandler';
import type { MenuHandle } from '../store/MenuHandle';
import type { MenuHandleStore } from '../store/MenuStore';
import { useMenubarContext } from '../../menubar/MenubarContext';
import type { MenuParent } from '../root/MenuRoot';
import { PATIENT_CLICK_THRESHOLD } from '../../internals/constants';
import { FocusGuard } from '../../utils/popups/focus/FocusGuard';
import { mergeProps } from '../../merge-props';
import type { InputProps } from '../../merge-props';

/**
 * A button that opens the menu.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuTrigger<Payload>(componentProps: MenuTrigger.Props<Payload>): JSX.Element {
  const rootContext = useMenuRootContext(true);
  const handleStore = usePopupHandleStore<MenuHandleStore<Payload>>(() => componentProps.handle);
  const store = createMemo(
    (): MenuHandleStore<Payload> | undefined =>
      handleStore() ?? (rootContext?.store as MenuHandleStore<Payload> | undefined),
  );
  if (!untrack(store)) {
    throw new Error(
      'Base UI: <Menu.Trigger> must be either used within a <Menu.Root> component or provided with a handle.',
    );
  }

  // Solid port: the interaction hooks take the store once, while a handle-bound trigger switches
  // between the handle's fallback store and the attached Root's store (React re-renders the
  // trigger with the new store). The trigger is created again for each store it talks to.
  return (
    <Show when={store()} keyed>
      {(currentStore) => <MenuTriggerImpl {...componentProps} store={currentStore} />}
    </Show>
  );
}

function MenuTriggerImpl<Payload>(
  componentProps: MenuTrigger.Props<Payload> & { store: MenuHandleStore<Payload> },
): JSX.Element {
  const elementProps = omit(
    componentProps,
    'render',
    'class',
    'style',
    'disabled',
    'nativeButton',
    'id',
    'openOnHover',
    'delay',
    'closeDelay',
    'handle',
    'payload',
    'store',
  );

  const store = untrack(() => componentProps.store);

  const thisTriggerId = useBaseUiId(() => {
    const id = componentProps.id;
    return id === false ? undefined : id;
  });

  const isTriggerActive = store.useState('isTriggerActive', thisTriggerId);
  const isOpenedByThisTrigger = store.useState('isOpenedByTrigger', thisTriggerId);
  const controlsId = store.useState('triggerControlsId', thisTriggerId);

  const triggerElementRef: { current: HTMLElement | null } = { current: null };

  const parent = useMenuParent();
  const compositeRootContext = useCompositeRootContext(true);
  const floatingTreeRootFromContext = useFloatingTree();

  // Solid port: React gives a trigger outside any `FloatingTree` (a detached one) a new tree, which
  // it forwards to the store as the menu's tree when the menu opens, and every part of the menu
  // follows the new tree on its next render. The tree hooks here read their tree once, so the
  // menu's tree can't change after it mounts: such a trigger joins the tree the store already
  // holds, which is also the one a contained trigger gets from the Root's `FloatingTree`.
  const floatingTreeRoot: FloatingTreeStore =
    floatingTreeRootFromContext ?? untrack(() => store.select('floatingTreeRoot'));

  const floatingNodeId = useFloatingNodeId(floatingTreeRoot);
  const floatingParentNodeId = useFloatingParentNodeId();

  const { registerTrigger, isMountedByThisTrigger } = useTriggerDataForwarding(
    thisTriggerId,
    triggerElementRef,
    store,
    () => ({
      payload: componentProps.payload,
      closeDelay: componentProps.closeDelay ?? 0,
      parent,
      floatingTreeRoot,
      floatingNodeId,
      floatingParentNodeId: floatingParentNodeId(),
      keyboardEventRelay: compositeRootContext?.relayKeyboardEvent,
    }),
  );

  const isInMenubar = parent.type === 'menubar';

  const rootDisabled = store.useState('disabled');

  const disabled = () =>
    (componentProps.disabled ?? false) ||
    rootDisabled() ||
    (parent.type === 'menubar' && parent.context.disabled());

  const { getButtonProps, buttonRef } = useButton({
    disabled,
    native: () => componentProps.nativeButton ?? true,
  });

  useEffect(
    () => [isOpenedByThisTrigger()] as const,
    ([isOpened]) => {
      if (!isOpened && parent.type === undefined) {
        store.context.allowMouseUpTriggerRef.current = false;
      }
    },
  );

  const triggerRef: { current: HTMLElement | null } = { current: null };
  const allowMouseUpTriggerTimeout = useTimeout();

  const handleDocumentMouseUp = (mouseEvent: MouseEvent) => {
    if (!triggerRef.current) {
      return;
    }

    allowMouseUpTriggerTimeout.clear();
    store.context.allowMouseUpTriggerRef.current = false;

    const mouseUpTarget = getTarget(mouseEvent) as Element | null;

    if (
      contains(triggerRef.current, mouseUpTarget) ||
      contains(store.select('positionerElement'), mouseUpTarget) ||
      mouseUpTarget === triggerRef.current
    ) {
      return;
    }

    if (mouseUpTarget != null && findRootOwnerId(mouseUpTarget) === store.select('rootId')) {
      return;
    }

    if (isMouseWithinBounds(mouseEvent, triggerRef.current)) {
      return;
    }

    floatingTreeRoot.events.emit('close', { domEvent: mouseEvent, reason: REASONS.cancelOpen });
  };

  useEffect(
    () => [isOpenedByThisTrigger()] as const,
    ([isOpened]) => {
      const doc = ownerDocument(triggerRef.current);

      if (isOpened && store.select('lastOpenChangeReason') === REASONS.triggerHover) {
        doc.addEventListener('mouseup', handleDocumentMouseUp, { once: true });

        return () => {
          doc.removeEventListener('mouseup', handleDocumentMouseUp);
        };
      }

      return undefined;
    },
  );

  const parentMenubarHasSubmenuOpen = () =>
    parent.type === 'menubar' && parent.context.hasSubmenuOpen();
  const openOnHover = () => componentProps.openOnHover ?? parentMenubarHasSubmenuOpen();

  const hoverProps = useHoverTriggerInteraction(store, {
    enabled: () =>
      openOnHover() &&
      !disabled() &&
      (!isInMenubar || (parentMenubarHasSubmenuOpen() && !isMountedByThisTrigger())),
    handleClose: safePolygon({ blockPointerEvents: !isInMenubar }),
    mouseOnly: true,
    move: false,
    restMs: parent.type === undefined ? () => componentProps.delay ?? 100 : undefined,
    delay: () => ({ close: componentProps.closeDelay ?? 0 }),
    triggerElementRef,
    externalTree: floatingTreeRoot,
    isActiveTrigger: isTriggerActive,
  });

  // Whether to ignore clicks to open the menu.
  // `lastOpenChangeReason` doesn't need to be reactive here, as we need to run this
  // only when `isOpenedByThisTrigger` changes.
  const stickIfOpen = useStickIfOpen(isOpenedByThisTrigger, () =>
    store.select('lastOpenChangeReason'),
  );

  const click = useClick(store, {
    enabled: () => !disabled(),
    event: () => (isOpenedByThisTrigger() && isInMenubar ? 'click' : 'mousedown'),
    toggle: true,
    ignoreMouse: false,
    stickIfOpen: parent.type === undefined ? stickIfOpen : false,
  });

  const focus = useFocus(store, {
    enabled: () => !disabled() && parentMenubarHasSubmenuOpen(),
  });

  const mixedToggleHandlers = useMixedToggleClickHandler({
    open: isOpenedByThisTrigger,
    enabled: isInMenubar,
    mouseDownAction: 'open',
  });

  const localInteractionProps = createMemo(() =>
    mergeProps(focus.reference?.(), click.reference?.()),
  );

  const rootTriggerProps = store.useState('triggerProps', isMountedByThisTrigger);
  // A filterable menu keeps real focus inside its popup and publishes what its trigger needs.
  const filterTriggerProps = store.useState('filterTriggerProps');

  const { handlePreFocusGuardFocus, handleFocusTargetFocus } = useTriggerFocusGuards(
    store,
    triggerElementRef,
  );

  const state: MenuTriggerState = {
    get disabled() {
      return disabled();
    },
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  const setTriggerRef = (element: HTMLElement) => {
    triggerRef.current = element;
  };
  const setTriggerElementRef = (element: HTMLElement) => {
    triggerElementRef.current = element;
  };
  onCleanup(() => {
    triggerRef.current = null;
    triggerElementRef.current = null;
  });

  const onMouseDown = (event: MouseEvent) => {
    if (store.select('open')) {
      return;
    }

    // mousedown -> mouseup on menu item should not trigger it within 200ms.
    allowMouseUpTriggerTimeout.start(200, () => {
      store.context.allowMouseUpTriggerRef.current = true;
    });

    const doc = ownerDocument(event.currentTarget as Element);
    doc.addEventListener('mouseup', handleDocumentMouseUp, { once: true });
  };

  const ref = [setTriggerRef, buttonRef, registerTrigger, setTriggerElementRef];
  const props = (): InputProps[] => [
    localInteractionProps(),
    hoverProps() ?? EMPTY_OBJECT,
    rootTriggerProps(),
    {
      'aria-haspopup': 'menu' as const,
      'aria-controls': controlsId(),
      id: thisTriggerId(),
      onMouseDown,
    },
    filterTriggerProps(),
    isInMenubar ? { role: 'menuitem' } : {},
    mixedToggleHandlers(),
    elementProps,
    getButtonProps,
  ];

  if (isInMenubar) {
    return (
      <CompositeItem
        tag="button"
        render={componentProps.render}
        class={componentProps.class}
        style={componentProps.style}
        state={state}
        refs={ref}
        props={props()}
        stateAttributesMapping={pressableTriggerOpenStateMapping}
      >
        {componentProps.children}
      </CompositeItem>
    );
  }

  const element = useRenderElement('button', componentProps, {
    stateAttributesMapping: pressableTriggerOpenStateMapping,
    state,
    ref,
    props,
  });

  // The element is created once, so it stays the same DOM node whether the focus guards are
  // rendered or not.
  return (
    <>
      <Show when={isOpenedByThisTrigger()}>
        <TriggerFocusGuard
          guardRef={store.context.beforeTriggerFocusGuardRef}
          onFocus={handlePreFocusGuardFocus}
        />
      </Show>
      {element}
      <Show when={isOpenedByThisTrigger()}>
        <TriggerFocusGuard
          guardRef={store.context.triggerFocusTargetRef}
          onFocus={handleFocusTargetFocus}
        />
      </Show>
    </>
  );
}

/**
 * A focus guard whose element is published to `guardRef` while it is mounted.
 */
function TriggerFocusGuard(props: {
  guardRef: { current: HTMLElement | null };
  onFocus: (event: FocusEvent & { currentTarget: HTMLSpanElement }) => void;
}): JSX.Element {
  const guardRef = untrack(() => props.guardRef);
  let guardElement: HTMLSpanElement | null = null;
  onCleanup(() => {
    if (guardRef.current === guardElement) {
      guardRef.current = null;
    }
  });
  return (
    <FocusGuard
      ref={(element: HTMLSpanElement) => {
        guardElement = element;
        guardRef.current = element;
      }}
      onFocus={(event: FocusEvent & { currentTarget: HTMLSpanElement }) => props.onFocus(event)}
    />
  );
}

export interface MenuTriggerProps<Payload = unknown>
  extends NativeButtonProps, BaseUIComponentProps<'button', MenuTriggerState> {
  children?: JSX.Element;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * A handle to associate the trigger with a menu.
   */
  handle?: MenuHandle<Payload> | undefined;
  /**
   * A payload to pass to the menu when it is opened.
   */
  payload?: Payload | undefined;
  /**
   * How long to wait before the menu may be opened on hover. Specified in milliseconds.
   *
   * Requires the `openOnHover` prop.
   * @default 100
   */
  delay?: number | undefined;
  /**
   * How long to wait before closing the menu that was opened on hover.
   * Specified in milliseconds.
   *
   * Requires the `openOnHover` prop.
   * @default 0
   */
  closeDelay?: number | undefined;
  /**
   * Whether the menu should also open when the trigger is hovered.
   */
  openOnHover?: boolean | undefined;
}

export interface MenuTriggerState {
  /**
   * Whether the menu is currently open and was opened by this trigger.
   */
  open: boolean;
  /**
   * Whether the trigger is disabled.
   */
  disabled: boolean;
}

export namespace MenuTrigger {
  export type Props<Payload = unknown> = MenuTriggerProps<Payload>;
  export type State = MenuTriggerState;
}

/**
 * Determines whether to ignore clicks after a hover-open.
 */
function useStickIfOpen(open: () => boolean, getOpenReason: () => string | null) {
  const stickIfOpenTimeout = useTimeout();
  const [stickIfOpen, setStickIfOpen] = createSignal(false, { ownedWrite: true });

  useIsoLayoutEffect(
    () => [open()] as const,
    ([isOpen]) => {
      const openReason = getOpenReason();
      if (isOpen && openReason === REASONS.triggerHover) {
        // Only allow "patient" clicks to close the menu if it's open.
        // If they clicked within 500ms of the menu opening, keep it open.
        setStickIfOpen(true);
        stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
          setStickIfOpen(false);
        });
      } else if (!isOpen) {
        stickIfOpenTimeout.clear();
        setStickIfOpen(false);
      }
    },
  );

  return stickIfOpen;
}

function useMenuParent(): MenuParent {
  const menubarContext = useMenubarContext(true);

  if (menubarContext) {
    return {
      type: 'menubar',
      context: menubarContext,
    };
  }

  return {
    type: undefined,
  };
}
