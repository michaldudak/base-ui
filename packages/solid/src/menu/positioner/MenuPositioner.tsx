import { createMemo, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { inertValue } from '#utils/inertValue';
import { useTimeout } from '#utils/useTimeout';
import { useEffect, useExternalEffect } from '#utils/useEffect';
import { FloatingNode } from '../../utils/popups/tree/FloatingTree';
import { MenuPositionerContext } from './MenuPositionerContext';
import { useMenuRootContext } from '../root/MenuRootContext';
import type { MenuRoot } from '../root/MenuRoot';
import type {
  Align,
  Side,
  UseAnchorPositioningSharedParameters,
} from '../../internals/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { CompositeList } from '../../internals/composite/list/CompositeList';
import { InternalBackdrop } from '../../utils/popups/InternalBackdrop';
import { useMenuPortalContext } from '../portal/MenuPortalContext';
import { DROPDOWN_COLLISION_AVOIDANCE, POPUP_COLLISION_AVOIDANCE } from '../../internals/constants';
import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { MenuOpenEventDetails } from '../utils/types';
import { useTriggerSwitchTransition } from '../../internals/useTriggerSwitchTransition';
import { usePopupPositioner } from '../../utils/popups/popupPositioner';
import { useAnchoredPopupScrollLock } from '../../utils/popups/useAnchoredPopupScrollLock';

/**
 * Positions the menu popup against the trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuPositioner(componentProps: MenuPositioner.Props): JSX.Element {
  const { store, virtualFocus, syncHighlightedItem } = useMenuRootContext();
  const keepMounted = useMenuPortalContext();
  const contextMenuContext = useContextMenuRootContext(true);

  const parent = store.useState('parent');
  const floatingTreeRoot = store.useState('floatingTreeRoot');
  const modal = store.useState('modal');
  const openMethod = store.useState('openMethod');
  const triggerElement = store.useState('activeTriggerElement');
  const positionerElement = store.useState('positionerElement');
  const lastOpenChangeReason = store.useState('lastOpenChangeReason');
  const floatingNodeId = store.useState('floatingNodeId');
  const floatingParentNodeId = store.useState('floatingParentNodeId');
  const domReference = store.useState('anchorElement');

  const side = () => componentProps.side;

  // The values that depend on the parent, as React computes them on each render.
  const positioningProps = createMemo(() => {
    const currentParent = parent();
    let anchor = componentProps.anchor;
    let sideOffset = componentProps.sideOffset;
    let alignOffset = componentProps.alignOffset;
    let align = componentProps.align;
    if (currentParent.type === 'context-menu') {
      anchor = anchor ?? currentParent.context?.anchor();
      align = align ?? 'start';
      if (!side() && align !== 'center') {
        alignOffset = componentProps.alignOffset ?? 2;
        sideOffset = componentProps.sideOffset ?? -5;
      }
    }

    let computedSide = side();
    let computedAlign = align;
    if (currentParent.type === 'menu') {
      computedSide = computedSide ?? 'inline-end';
      computedAlign = computedAlign ?? 'start';
    } else if (currentParent.type === 'menubar') {
      computedSide =
        computedSide ??
        (currentParent.context.orientation() === 'vertical' ? 'inline-end' : 'bottom');
      computedAlign = computedAlign ?? 'start';
    }

    const defaultCollisionAvoidance =
      currentParent.type === 'menu' ? POPUP_COLLISION_AVOIDANCE : DROPDOWN_COLLISION_AVOIDANCE;
    const collisionAvoidance = componentProps.collisionAvoidance ?? defaultCollisionAvoidance;

    const contextMenu = currentParent.type === 'context-menu';

    return {
      anchor,
      sideOffset,
      alignOffset,
      computedSide,
      computedAlign,
      collisionAvoidance,
      contextMenu,
    };
  });

  // `element` is a lazy getter: it is read inside the providers below (not destructured here).
  const popupPositioner = usePopupPositioner(store, componentProps, {
    keepMounted,
    // Getters rather than accessors, so the parameters read like React's values (and stay
    // reactive where `useAnchorPositioning` reads them).
    positioning: {
      get anchor() {
        return positioningProps().anchor;
      },
      get collisionAvoidance() {
        return positioningProps().collisionAvoidance;
      },
      get positionMethod() {
        return contextMenuContext ? 'fixed' : componentProps.positionMethod;
      },
      get side() {
        return positioningProps().computedSide;
      },
      get sideOffset() {
        return positioningProps().sideOffset;
      },
      get align() {
        return positioningProps().computedAlign;
      },
      get alignOffset() {
        return positioningProps().alignOffset;
      },
      get arrowPadding() {
        return positioningProps().contextMenu ? 0 : componentProps.arrowPadding;
      },
      get nodeId() {
        return floatingNodeId();
      },
      get shift() {
        const { contextMenu, collisionAvoidance } = positioningProps();
        return contextMenu
          ? {
              crossAxis: !('side' in collisionAvoidance && collisionAvoidance.side === 'flip'),
              rootBoundary: 'layoutViewport' as const,
            }
          : undefined;
      },
      // Read once by the positioning: the tree a menu belongs to doesn't change.
      externalTree: store.select('floatingTreeRoot'),
      get lazyFlip() {
        return virtualFocus() ? ('placement' as const) : false;
      },
    },
    state: {
      get nested() {
        return parent().type === 'menu';
      },
    },
  });
  const { positioning: positioner, open, mounted } = popupPositioner;

  useEffect(
    () => [floatingTreeRoot()] as const,
    ([currentFloatingTreeRoot]) => {
      function onMenuOpenChange(details: MenuOpenEventDetails) {
        // Solid port: read when the event arrives. The node id changes along with `open` (the
        // menu takes its trigger's id), and the effect that emits this event can run before this
        // one has seen the new id.
        const currentFloatingNodeId = store.select('floatingNodeId');
        if (details.open) {
          if (details.parentNodeId === currentFloatingNodeId) {
            store.set('hoverEnabled', false);
          }
          // A submenu that is already closed has nothing to close, and a dropped close would
          // cancel a hover open it has pending. This mirrors the drop rule in `setOpen`.
          if (
            details.nodeId !== currentFloatingNodeId &&
            details.parentNodeId === store.select('floatingParentNodeId') &&
            (store.state.open || store.state.openProp)
          ) {
            store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
          }
        }
      }

      currentFloatingTreeRoot.events.on('menuopenchange', onMenuOpenChange);

      return () => {
        currentFloatingTreeRoot.events.off('menuopenchange', onMenuOpenChange);
      };
    },
  );

  useEffect(
    () => [floatingTreeRoot()] as const,
    ([currentFloatingTreeRoot]) => {
      if (store.select('floatingParentNodeId') == null) {
        return undefined;
      }

      function onParentClose(details: MenuOpenEventDetails) {
        if (details.open || details.nodeId !== store.select('floatingParentNodeId')) {
          return;
        }

        const reason: MenuRoot.ChangeEventReason = details.reason ?? REASONS.siblingOpen;
        store.setOpen(false, createChangeEventDetails(reason));
      }

      currentFloatingTreeRoot.events.on('menuopenchange', onParentClose);

      return () => {
        currentFloatingTreeRoot.events.off('menuopenchange', onParentClose);
      };
    },
  );

  const closeTimeout = useTimeout();

  // Clear pending close timeout when the menu closes.
  useEffect(
    () => [open()] as const,
    ([isOpen]) => {
      if (!isOpen) {
        closeTimeout.clear();
      }
    },
  );

  // Close unrelated child submenus when hovering a different item in the parent menu.
  useEffect(
    () => [floatingTreeRoot(), open(), triggerElement()] as const,
    ([currentFloatingTreeRoot, isOpen, currentTriggerElement]) => {
      function onItemHover(event: { nodeId: string | undefined; target: Element | null }) {
        // If an item within our parent menu is hovered, and this menu's trigger is not that item,
        // close this submenu. This ensures hovering a different item in the parent closes other
        // branches.
        if (!isOpen || event.nodeId !== store.select('floatingParentNodeId')) {
          return;
        }

        if (event.target && currentTriggerElement && currentTriggerElement !== event.target) {
          const delay = store.select('closeDelay');
          if (delay > 0) {
            if (!closeTimeout.isStarted()) {
              closeTimeout.start(delay, () => {
                store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
              });
            }
          } else {
            store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
          }
        } else {
          // User re-hovered the submenu trigger, cancel pending close.
          closeTimeout.clear();
        }
      }

      currentFloatingTreeRoot.events.on('itemhover', onItemHover);
      return () => {
        currentFloatingTreeRoot.events.off('itemhover', onItemHover);
      };
    },
  );

  // Publishes the open state to the tree's event bus. The other menus of the tree react to the
  // event (a parent stops opening on hover, an open sibling closes).
  useExternalEffect(
    () => [floatingTreeRoot(), open(), floatingNodeId(), floatingParentNodeId()] as const,
    ([currentFloatingTreeRoot, isOpen, currentFloatingNodeId, currentFloatingParentNodeId]) => {
      const eventDetails: MenuOpenEventDetails = {
        open: isOpen,
        nodeId: currentFloatingNodeId,
        parentNodeId: currentFloatingParentNodeId,
        reason: store.select('lastOpenChangeReason'),
      };

      currentFloatingTreeRoot.events.emit('menuopenchange', eventDetails);
    },
  );

  useTriggerSwitchTransition({
    store,
    domReference,
    positionerElement,
    open,
  });

  const menubarModal = () => {
    const currentParent = parent();
    return currentParent.type === 'menubar' && currentParent.context.modal();
  };
  const popupModal = () => modal() && lastOpenChangeReason() !== REASONS.triggerHover;

  useAnchoredPopupScrollLock(
    () => open() && (menubarModal() || popupModal()),
    () => openMethod() === 'touch',
    positionerElement,
    triggerElement,
  );

  const shouldRenderBackdrop = createMemo(() => {
    const currentParent = parent();
    return (
      mounted() &&
      currentParent.type !== 'menu' &&
      ((currentParent.type !== 'menubar' &&
        modal() &&
        lastOpenChangeReason() !== REASONS.triggerHover) ||
        (currentParent.type === 'menubar' && currentParent.context.modal()))
    );
  });

  // cuts a hole in the backdrop to allow pointer interaction with the menubar or dropdown menu
  // trigger element
  const backdropCutout = (): HTMLElement | null => {
    const currentParent = parent();
    if (currentParent.type === 'menubar') {
      return currentParent.context.contentElement();
    }
    if (currentParent.type === undefined) {
      return triggerElement() as HTMLElement | null;
    }
    return null;
  };

  const setInternalBackdropElement = (backdropElement: HTMLDivElement) => {
    const currentParent = store.select('parent');
    if (currentParent.type === 'context-menu' || currentParent.type === 'nested-context-menu') {
      currentParent.context.internalBackdropRef.current = backdropElement;
    }
  };

  return (
    <MenuPositionerContext value={positioner}>
      <Show when={shouldRenderBackdrop()}>
        <InternalBackdrop
          ref={setInternalBackdropElement}
          inert={inertValue(!open())}
          cutout={backdropCutout()}
        />
      </Show>
      <FloatingNode id={floatingNodeId()}>
        <CompositeList
          elementsRef={store.context.itemDomElements}
          labelsRef={store.context.itemLabels}
          onMapChange={syncHighlightedItem}
        >
          {popupPositioner.element}
        </CompositeList>
      </FloatingNode>
    </MenuPositionerContext>
  );
}

export interface MenuPositionerState {
  /**
   * Whether the menu is currently open.
   */
  open: boolean;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side;
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the anchor element is hidden.
   */
  anchorHidden: boolean;
  /**
   * Whether the component is nested.
   */
  nested: boolean;
  /**
   * Whether CSS transitions should be disabled.
   */
  instant: string | undefined;
}

export interface MenuPositionerProps
  extends
    Omit<UseAnchorPositioningSharedParameters, 'side' | 'align'>,
    BaseUIComponentProps<'div', MenuPositionerState> {
  /**
   * How to align the popup relative to the specified side.
   *
   * Submenus and menubars default to `'start'`.
   * @default 'center'
   */
  align?: UseAnchorPositioningSharedParameters['align'] | undefined;
  /**
   * Which side of the anchor element to align the popup against.
   * May automatically change to avoid collisions.
   *
   * Submenus and vertical menubars default to `'inline-end'`.
   * @default 'bottom'
   */
  side?: UseAnchorPositioningSharedParameters['side'] | undefined;
}

export namespace MenuPositioner {
  export type State = MenuPositionerState;
  export type Props = MenuPositionerProps;
}
