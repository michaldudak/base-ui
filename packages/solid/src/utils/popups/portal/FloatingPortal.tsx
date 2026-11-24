import { createContext, createSignal, omit, onCleanup, Show, useContext } from 'solid-js';
import type { Accessor, Setter } from 'solid-js';
import { Portal } from '@solidjs/web';
import type { JSX } from '@solidjs/web';
import { isNode } from '@floating-ui/utils/dom';
import { addEventListener } from '#utils/addEventListener';
import { mergeCleanups } from '#utils/mergeCleanups';
import { useId } from '#utils/useId';
import { useEffect, useIsoLayoutEffect } from '#utils/useEffect';
import { EMPTY_OBJECT } from '#utils/empty';
import { FocusGuard } from '../focus/FocusGuard';
import {
  enableFocusInside,
  disableFocusInside,
  getPreviousTabbable,
  getNextTabbable,
  isOutsideEvent,
} from '../focus/tabbable';
import { createChangeEventDetails } from '../../../internals/createBaseUIEventDetails';
import { REASONS } from '../../../internals/reasons';
import { createAttribute } from '../createAttribute';
import { useRenderElement } from '../../../internals/useRenderElement';
import type { UseRenderElementComponentProps } from '../../../internals/useRenderElement';
import { ownerVisuallyHidden } from '../../../internals/constants';
import type { BaseUIComponentProps } from '../../../internals/types';
import { createFlushBeforePaint } from '../../../internals/createFlushBeforePaint';

type FocusManagerState = null | {
  modal: boolean;
  open: boolean;
  onOpenChange(
    open: boolean,
    data?: { reason?: string | undefined; event?: Event | undefined },
  ): void;
  domReference: Element | null;
  closeOnFocusOut: boolean;
};

const PortalContext = createContext<null | {
  portalNode: Accessor<HTMLElement | null>;
  setFocusManagerState: Setter<FocusManagerState>;
  beforeInsideRef: { current: HTMLSpanElement | null };
  afterInsideRef: { current: HTMLSpanElement | null };
  beforeOutsideRef: { current: HTMLSpanElement | null };
  afterOutsideRef: { current: HTMLSpanElement | null };
}>(null);

export const usePortalContext = () => useContext(PortalContext);

const attr = createAttribute('portal');
// A separate queue: a shared batch could run an animation completion that removes the container
// before this read commits.
const flushContainerUpdates = createFlushBeforePaint();

type PortalContainer = HTMLElement | ShadowRoot | null;

export interface UseFloatingPortalNodeProps {
  ref?: ((element: HTMLDivElement) => void) | undefined;
  /**
   * An element, a ref object, or (Solid only) an accessor returning an element.
   */
  container?:
    PortalContainer | { current: PortalContainer } | Accessor<PortalContainer> | undefined;
  componentProps?: UseRenderElementComponentProps<any> | undefined;
  elementProps?: object | undefined;
}

export interface UseFloatingPortalNodeResult {
  node: Accessor<HTMLElement | null>;
  /**
   * The `id` attribute of the portal node.
   */
  nodeId: Accessor<string | undefined>;
  subtree: JSX.Element;
}

export function useFloatingPortalNode(
  props: UseFloatingPortalNodeProps = {},
): UseFloatingPortalNodeResult {
  const componentProps =
    props.componentProps ?? (EMPTY_OBJECT as UseRenderElementComponentProps<any>);

  const uniqueId = useId();
  const portalContext = usePortalContext();
  const parentPortalNode = () => portalContext?.portalNode();

  // A container passed as an accessor is read like a container element.
  const containerProp = () => {
    const container = props.container;
    return typeof container === 'function' ? container() : container;
  };

  const [containerElement, setContainerElement] = createSignal<PortalContainer>(null, {
    ownedWrite: true,
  });
  const [portalNode, setPortalNode] = createSignal<HTMLElement | null>(null, { ownedWrite: true });
  const setPortalNodeRef = (node: HTMLElement | null) => {
    if (node !== null) {
      // the useIsoLayoutEffect below watching containerProp / parentPortalNode
      // sets setPortalNode(null) when the container becomes null or changes.
      // So even though the ref callback now ignores null, the portal node still gets cleared.
      setPortalNode(node);
    }
  };

  const containerRef: { current: PortalContainer } = { current: null };
  const [containerCheck, setContainerCheck] = createSignal(0, { ownedWrite: true });
  const pendingResolveRef: { current: (() => void) | null } = { current: null };

  // Must run before the effect below, or a mount would consume its own pending resolve.
  useIsoLayoutEffect(
    () => [containerCheck()],
    () => {
      const resolve = pendingResolveRef.current;
      if (resolve) {
        pendingResolveRef.current = null;
        // The retry committed, so refs are attached. Resolve after cascading layout updates.
        flushContainerUpdates(resolve);
      }
    },
  );

  useIsoLayoutEffect(
    () => [containerProp(), parentPortalNode()] as const,
    ([container, parentNode]) => {
      // Wait for the container to be resolved if explicitly `null`.
      if (container === null) {
        if (containerRef.current) {
          containerRef.current = null;
          setPortalNode(null);
          setContainerElement(null);
        }
        return undefined;
      }

      let cancelled = false;
      function resolveContainer() {
        if (cancelled) {
          return;
        }

        const resolvedContainer =
          (container && (isNode(container) ? container : container.current)) ??
          parentNode ??
          document.body;

        if (resolvedContainer == null) {
          if (containerRef.current) {
            containerRef.current = null;
            setPortalNode(null);
            setContainerElement(null);
          }
          return;
        }

        if (containerRef.current !== resolvedContainer) {
          containerRef.current = resolvedContainer;
          setPortalNode(null);
          setContainerElement(resolvedContainer);
        }
      }

      if (container && !isNode(container) && !container.current) {
        // Ancestor and later sibling refs attach after this effect. Wait for the retry to commit.
        pendingResolveRef.current = resolveContainer;
        setContainerCheck((value) => value + 1);
      } else {
        resolveContainer();
      }

      return () => {
        cancelled = true;
        // A disposed subtree can clean up effects before the retry commits.
        if (pendingResolveRef.current === resolveContainer) {
          pendingResolveRef.current = null;
        }
      };
    },
  );

  // This `Portal` injects the portal element into the `container`.
  // Another `Portal` inside `FloatingPortal`/`FloatingPortalLite` then injects the children into
  // the portal element.
  // Keyed on the container: like React's `createPortal` into another container, a new container
  // gets a new portal element, whose ref then sets the portal node again.
  const portalSubtree = (
    <Show when={containerElement()} keyed>
      {(container: HTMLElement | ShadowRoot) => (
        // Solid's `Portal` mounts into a `ShadowRoot` as well (it only calls `insertBefore` and
        // `removeChild` on it), but its `mount` prop is typed `Element`.
        <Portal mount={container as Element}>
          {useRenderElement('div', componentProps, {
            ref: [props.ref, setPortalNodeRef],
            props: () => [
              {
                id: uniqueId,
                [attr]: '',
              },
              props.elementProps,
            ],
            // The children are rendered into the portal element by a second `Portal`.
            children: () => null,
          })}
        </Portal>
      )}
    </Show>
  );

  return {
    node: portalNode,
    // `id` and `render` props can override or remove the generated ID. Use the merged
    // value so `aria-owns` never points at an ID absent from the DOM.
    nodeId: () => {
      const elementProps = props.elementProps;
      if (elementProps && 'id' in elementProps) {
        const id = elementProps.id;
        return typeof id === 'string' ? id : undefined;
      }
      return uniqueId;
    },
    subtree: portalSubtree,
  };
}

/**
 * Portals the floating element into a given container element — by default,
 * outside of the app root and into the body.
 * This is necessary to ensure the floating element can appear outside any
 * potential parent containers that cause clipping (such as `overflow: hidden`),
 * while retaining its location in the component tree.
 * @see https://floating-ui.com/docs/FloatingPortal
 * @internal
 */
export function FloatingPortal(componentProps: FloatingPortal.Props<any>): JSX.Element {
  // `ref` is applied by `useRenderElement` from `componentProps`, like React's forwarded ref.
  const elementProps = omit(
    componentProps,
    'render',
    'class',
    'style',
    'children',
    'container',
    'portalOwnerRole',
    'ref',
  );

  const {
    node: portalNode,
    nodeId: portalNodeId,
    subtree: portalSubtree,
  } = useFloatingPortalNode({
    get container() {
      return componentProps.container;
    },
    componentProps,
    elementProps,
  });

  const beforeOutsideRef: { current: HTMLSpanElement | null } = { current: null };
  const afterOutsideRef: { current: HTMLSpanElement | null } = { current: null };
  const beforeInsideRef: { current: HTMLSpanElement | null } = { current: null };
  const afterInsideRef: { current: HTMLSpanElement | null } = { current: null };

  const [focusManagerState, setFocusManagerState] = createSignal<FocusManagerState>(null, {
    ownedWrite: true,
  });
  const focusInsideDisabledRef = { current: false };

  const modal = () => focusManagerState()?.modal;
  const open = () => focusManagerState()?.open;

  const shouldRenderGuards = () => {
    const state = focusManagerState();
    return !!state && !state.modal && state.open && !!portalNode();
  };

  // https://codesandbox.io/s/tabbable-portal-f4tng?file=/src/TabbablePortal.tsx
  useEffect(
    () => [portalNode(), modal()] as const,
    ([node, isModal]) => {
      if (!node || isModal) {
        return undefined;
      }

      // Make sure elements inside the portal element are tabbable only when the
      // portal has already been focused, either by tabbing into a focus trap
      // element outside or using the mouse.
      function onFocus(event: FocusEvent) {
        if (node && event.relatedTarget && isOutsideEvent(event)) {
          if (event.type === 'focusin') {
            if (focusInsideDisabledRef.current) {
              enableFocusInside(node);
              focusInsideDisabledRef.current = false;
            }
          } else {
            disableFocusInside(node);
            focusInsideDisabledRef.current = true;
          }
        }
      }

      // Listen to the event on the capture phase so they run before the focus
      // trap elements onFocus prop is called.
      return mergeCleanups(
        addEventListener(node, 'focusin', onFocus, true),
        addEventListener(node, 'focusout', onFocus, true),
      );
    },
  );

  useIsoLayoutEffect(
    () => [open(), portalNode()] as const,
    ([isOpen, node]) => {
      if (!node || isOpen !== true || !focusInsideDisabledRef.current) {
        return;
      }

      // Restore tabbability before the focus manager's queued focus-on-open step runs.
      enableFocusInside(node);
      focusInsideDisabledRef.current = false;
    },
  );

  const portalContextValue = {
    beforeOutsideRef,
    afterOutsideRef,
    beforeInsideRef,
    afterInsideRef,
    portalNode,
    setFocusManagerState,
  };

  // Clears a guard's ref when the guard is removed, like React does for unmounted refs.
  const setGuardRef = (ref: { current: HTMLSpanElement | null }) => (element: HTMLSpanElement) => {
    ref.current = element;
    onCleanup(() => {
      if (ref.current === element) {
        ref.current = null;
      }
    });
  };

  return (
    <>
      {portalSubtree}
      <PortalContext value={portalContextValue}>
        <Show when={shouldRenderGuards() && portalNode()}>
          {(node) => (
            <FocusGuard
              data-type="outside"
              ref={setGuardRef(beforeOutsideRef)}
              onFocus={(event) => {
                if (isOutsideEvent(event, node())) {
                  beforeInsideRef.current?.focus();
                } else {
                  const state = focusManagerState();
                  const domReference = state ? state.domReference : null;
                  const prevTabbable = getPreviousTabbable(domReference);
                  prevTabbable?.focus();
                }
              }}
            />
          )}
        </Show>
        <Show when={shouldRenderGuards() && portalNode()}>
          <span
            role={componentProps.portalOwnerRole}
            aria-owns={portalNodeId()}
            style={ownerVisuallyHidden}
          />
        </Show>
        <Show when={portalNode()} keyed>
          {(node: HTMLElement) => <Portal mount={node}>{componentProps.children}</Portal>}
        </Show>
        <Show when={shouldRenderGuards() && portalNode()}>
          {(node) => (
            <FocusGuard
              data-type="outside"
              ref={setGuardRef(afterOutsideRef)}
              onFocus={(event) => {
                if (isOutsideEvent(event, node())) {
                  afterInsideRef.current?.focus();
                } else {
                  const state = focusManagerState();
                  const domReference = state ? state.domReference : null;
                  const nextTabbable = getNextTabbable(domReference);
                  nextTabbable?.focus();

                  if (state?.closeOnFocusOut) {
                    state?.onOpenChange(false, createChangeEventDetails(REASONS.focusOut, event));
                  }
                }
              }}
            />
          )}
        </Show>
      </PortalContext>
    </>
  );
}

export interface FloatingPortalState {}

export namespace FloatingPortal {
  export type State = FloatingPortalState;
  export interface Props<TState> extends BaseUIComponentProps<'div', TState> {
    /**
     * A parent element to render the portal element into.
     */
    container?: UseFloatingPortalNodeProps['container'] | undefined;
    /**
     * @ignore
     * The role for the hidden `aria-owns` owner element.
     */
    portalOwnerRole?: JSX.HTMLAttributes<HTMLSpanElement>['role'] | undefined;
  }
}
