import { onCleanup } from 'solid-js';
import { addEventListener } from '#utils/addEventListener';
import { mergeCleanups } from '#utils/mergeCleanups';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useEffect, useIsoLayoutEffect } from '#utils/useEffect';
import { useTimeout } from '#utils/useTimeout';
import { isElement } from '@floating-ui/utils/dom';
import { createChangeEventDetails } from '../../../internals/createBaseUIEventDetails';
import { REASONS } from '../../../internals/reasons';
import { useFloatingParentNodeId, useFloatingTree } from '../tree/FloatingTree';
import type { PopupInteractionStore } from '../types';
import { getNodeChildren } from '../tree/nodes';
import { getHoverIntent } from './hoverIntent';

export type UseHoverPopupInteractionProps = {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined> | undefined;
  /**
   * Waits for the specified time when the event listener runs before changing
   * the `open` state.
   * An accessor is resolved when the value is used.
   * @default 0
   */
  closeDelay?: number | (() => number) | undefined;
  /**
   * Tree node id override for floating elements that participate in the tree
   * without a `PopupPositioningContext`, such as inline nested navigation menus.
   */
  nodeId?: MaybeAccessor<string | undefined> | undefined;
};

/**
 * Provides hover interactions that should be attached to the popup's positioner element.
 */
export function useHoverPopupInteraction(
  store: PopupInteractionStore,
  parameters: UseHoverPopupInteractionProps = {},
): void {
  const enabled = () => access(parameters.enabled) ?? true;
  const closeDelayProp = () => parameters.closeDelay ?? 0;
  const nodeIdProp = () => access(parameters.nodeId);

  const open = store.useState('open');
  const positionerElement = store.useState('positionerElement');
  const anchorElement = store.useState('anchorElement');

  const tree = useFloatingTree();
  const parentId = useFloatingParentNodeId();
  const intent = getHoverIntent(store);

  const childClosedTimeout = useTimeout();

  useIsoLayoutEffect(
    () => [open()] as const,
    ([isOpen]) => {
      if (!isOpen) {
        intent.reset();
      }
    },
  );

  onCleanup(() => {
    intent.cancelPendingOpen();
    intent.restoreOutsidePointerEvents();
  });

  useIsoLayoutEffect(
    () => [enabled(), open(), anchorElement(), positionerElement(), parentId()] as const,
    ([isEnabled, isOpen, anchor, positioner, parentNodeId]) => {
      if (!isEnabled) {
        return undefined;
      }

      if (
        isOpen &&
        isElement(anchor) &&
        positioner &&
        intent.blockOutsidePointerEventsForPopup(
          anchor as HTMLElement | SVGSVGElement,
          positioner,
          tree,
          parentNodeId,
        )
      ) {
        return intent.restoreOutsidePointerEvents;
      }

      return undefined;
    },
  );

  useEffect(
    () => [enabled(), positionerElement(), closeDelayProp(), nodeIdProp(), parentId()] as const,
    ([isEnabled, positioner, closeDelay, nodeId, parentNodeId]) => {
      if (!isEnabled) {
        return undefined;
      }

      function hasParentChildren() {
        return !!(
          tree &&
          parentNodeId &&
          getNodeChildren(tree.nodesRef.current, parentNodeId).length > 0
        );
      }

      function onFloatingMouseEnter() {
        intent.onPopupMouseEnter();
        childClosedTimeout.clear();
        tree?.events.off('floating.closed', onNodeClosed);
      }

      function onFloatingMouseLeave(event: MouseEvent) {
        if (hasParentChildren() && tree) {
          tree.events.on('floating.closed', onNodeClosed);
          return;
        }

        intent.onPopupMouseLeave(event, { closeDelay, tree, nodeId });
      }

      function onPopupPointerDown(event: PointerEvent) {
        intent.onPopupPointerDown(event);
      }

      function onNodeClosed(event: MouseEvent) {
        if (!tree || !parentNodeId || hasParentChildren()) {
          return;
        }
        // Allow the mouseenter event to fire in case child was closed because mouse moved into parent.
        childClosedTimeout.start(0, () => {
          tree.events.off('floating.closed', onNodeClosed);
          store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
          tree.events.emit('floating.closed', event);
        });
      }

      const floating = positioner;
      return mergeCleanups(
        floating && addEventListener(floating, 'mouseenter', onFloatingMouseEnter),
        floating && addEventListener(floating, 'mouseleave', onFloatingMouseLeave),
        floating && addEventListener(floating, 'pointerdown', onPopupPointerDown, true),
        () => {
          tree?.events.off('floating.closed', onNodeClosed);
        },
      );
    },
  );
}
