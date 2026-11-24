import { createMemo, omit, onCleanup, useContext } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { InteractionType } from '#utils/useEnhancedClickHandler';
import { useEffect } from '#utils/useEffect';
import { FloatingFocusManager } from '../../utils/popups/focus/FloatingFocusManager';
import { useHoverPopupInteraction } from '../../utils/popups/interactions/useHoverPopupInteraction';
import type { FloatingFocusManagerProps } from '../../utils/popups/focus/FloatingFocusManager';
import { useMenuRootContext } from '../root/MenuRootContext';
import type { MenuRoot } from '../root/MenuRoot';
import { useMenuPositionerContext } from '../positioner/MenuPositionerContext';
import { useRenderElement } from '../../internals/useRenderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Side, Align } from '../../internals/useAnchorPositioning';
import type { TransitionStatus } from '../../internals/useTransitionStatus';
import { popupTransitionStateMapping } from '../../utils/popups/popupStateMapping';
import { useOpenChangeComplete } from '../../internals/useOpenChangeComplete';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useToolbarRootContext } from '../../toolbar/root/ToolbarRootContext';
import { COMPOSITE_KEYS } from '../../internals/composite/composite';
import { getDisabledMountTransitionStyles } from '../../internals/getDisabledMountTransitionStyles';
import { useMenuSubmenuRootContext } from '../submenu-root/MenuSubmenuRootContext';
import { useRenderedId } from '../../internals/resolveRenderedId';
import { resolvePopupLabel } from '../../internals/resolvePopupLabel';
import { MenuFilterImplContext, useMenuFilterImpl } from '../filter-root/MenuFilterContext';
import type { MenuFilterParentHandoff } from '../filter-root/MenuFilterContext';

interface MenuPopupPlainProps extends MenuPopup.Props {
  /** A filter root's own initial focus target; the plain default focuses the popup or its list. */
  initialFocus?: FloatingFocusManagerProps['initialFocus'] | undefined;
}

/**
 * @internal
 */
export function MenuPopupPlain(componentProps: MenuPopupPlainProps): JSX.Element {
  const elementProps = omit(
    componentProps,
    'render',
    'class',
    'style',
    'finalFocus',
    'id',
    'initialFocus',
  );

  const { store, generatedPopupId, setRenderedPopupId, virtualFocus, orientation } =
    useMenuRootContext();
  const inheritedSubmenuRootContext = useMenuSubmenuRootContext();
  const { side, align } = useMenuPositionerContext();
  const insideToolbar = useToolbarRootContext(true) != null;

  const open = store.useState('open');
  const transitionStatus = store.useState('transitionStatus');
  const popupProps = store.useState('popupProps');
  const mounted = store.useState('mounted');
  const instantType = store.useState('instantType');
  const activeTriggerElement = store.useState('activeTriggerElement');
  const parent = store.useState('parent');
  const lastOpenChangeReason = store.useState('lastOpenChangeReason');
  const rootId = store.useState('rootId');
  const floatingTreeRoot = store.useState('floatingTreeRoot');
  const closeDelay = store.useState('closeDelay');
  const hoverEnabled = store.useState('hoverEnabled');
  const disabled = store.useState('disabled');
  const openMethod = store.useState('openMethod');
  const activeTriggerId = store.useState('activeTriggerId');
  const listElement = store.useState('listElement');

  const [id, registerIdRef] = useRenderedId(componentProps, generatedPopupId, setRenderedPopupId);

  const ariaLabelledBy = () =>
    resolvePopupLabel(componentProps, activeTriggerElement(), activeTriggerId());

  // A dialog's menu can render under a submenu provider; only the actual submenu inherits it.
  const submenuRootContext = () =>
    parent().type === 'menu' ? inheritedSubmenuRootContext : undefined;
  const isContextMenu = () => parent().type === 'context-menu';

  const listInitialFocus = () => {
    // A keyboard or screen reader open highlights an item, which list navigation focuses.
    if (store.state.activeIndex !== null) {
      return false;
    }
    // The list holds the `menu` role, so a pointer open lands focus on it rather than on the
    // presentational popup.
    return store.state.listElement;
  };

  const initialFocus = createMemo((): FloatingFocusManagerProps['initialFocus'] => {
    const initialFocusProp = componentProps.initialFocus;
    let result: FloatingFocusManagerProps['initialFocus'] =
      initialFocusProp ?? parent().type !== 'menu';
    if (initialFocusProp === undefined && listElement() && parent().type !== 'menu') {
      result = listInitialFocus;
    }
    return result;
  });

  useOpenChangeComplete({
    open,
    ref: store.context.popupRef,
    onComplete() {
      if (store.select('open')) {
        store.context.onOpenChangeComplete?.(true);
      }
    },
  });

  useEffect(
    () => [floatingTreeRoot()] as const,
    ([currentFloatingTreeRoot]) => {
      function handleClose(event: {
        domEvent: Event | undefined;
        reason: MenuRoot.ChangeEventReason;
      }) {
        store.setOpen(false, createChangeEventDetails(event.reason, event.domEvent));
      }

      currentFloatingTreeRoot.events.on('close', handleClose);

      return () => {
        currentFloatingTreeRoot.events.off('close', handleClose);
      };
    },
  );

  useHoverPopupInteraction(store, {
    enabled: () => hoverEnabled() && !disabled() && !isContextMenu() && parent().type !== 'menubar',
    closeDelay,
  });

  const setPopupElement = (element: HTMLElement | null) => {
    store.context.popupRef.current = element;
    store.set('popupElement', element);
  };
  onCleanup(() => setPopupElement(null));

  // Only a menu under a filter root bundles the handoff to a filterable parent. Whether one is
  // above is fixed for a mounted popup, so the hook doesn't change.
  const useParentHandoff =
    useContext(MenuFilterImplContext)?.useParentHandoff ?? useNoParentHandoff;
  const { parentVirtualFocusRef, handleFocus } = useParentHandoff(
    store,
    parent,
    open,
    virtualFocus,
  );

  const state: MenuPopupState = {
    get transitionStatus() {
      return transitionStatus();
    },
    get side() {
      return side();
    },
    get align() {
      return align();
    },
    get open() {
      return open();
    },
    get nested() {
      return parent().type === 'menu';
    },
    get instant() {
      return instantType();
    },
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    submenuRootContext()?.onPopupKeyDown?.(event);
    if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
      event.stopPropagation();
    }
  };

  // An unset attribute is left out rather than set to `undefined`: a render function spreads the
  // props over its element's own attributes (React reads those off the `render` element instead),
  // and a present `undefined` key would clear them.
  const menuSemanticsProps = () => {
    const result: Record<string, string> = { role: 'menu' };
    // `menu` is implicitly vertical, so only the non-default value needs to be rendered.
    if (orientation() === 'horizontal') {
      result['aria-orientation'] = 'horizontal';
    }
    const labelledBy = ariaLabelledBy();
    if (labelledBy !== undefined) {
      result['aria-labelledby'] = labelledBy;
    }
    return result;
  };

  const element = useRenderElement('div', componentProps, {
    state,
    ref: [setPopupElement, registerIdRef],
    stateAttributesMapping: popupTransitionStateMapping,
    props: () => [
      popupProps(),
      {
        id: id(),
        // A rendered `Menu.List` carries the `menu` semantics instead.
        ...(listElement() ? { role: 'presentation' } : menuSemanticsProps()),
        onKeyDown: handleKeyDown,
        onFocus: handleFocus,
      },
      getDisabledMountTransitionStyles(transitionStatus()),
      elementProps,
      { 'data-rootownerid': rootId() } as Record<string, string | undefined>,
    ],
  });

  const returnFocus = () => {
    let result = parent().type === undefined || isContextMenu();
    if (
      activeTriggerElement() ||
      (parent().type === 'menubar' && lastOpenChangeReason() !== REASONS.outsidePress)
    ) {
      result = true;
    }
    return result;
  };

  // Internal defaults rather than consumer targets, so focus that already moved is respected.
  const dynamicReturnFocus = () => submenuRootContext()?.getReturnElement ?? parentVirtualFocusRef;

  return (
    <FloatingFocusManager
      store={store}
      openInteractionType={openMethod()}
      modal={isContextMenu()}
      disabled={!mounted()}
      returnFocus={componentProps.finalFocus ?? dynamicReturnFocus() ?? returnFocus()}
      explicitReturnFocus={
        componentProps.finalFocus === undefined && dynamicReturnFocus() ? false : undefined
      }
      initialFocus={initialFocus()}
      restoreFocus
      getInsideElements={
        parent().type === undefined
          ? () => [store.context.beforeTriggerFocusGuardRef.current]
          : undefined
      }
      externalTree={parent().type !== 'menubar' ? floatingTreeRoot() : undefined}
      previousFocusableElement={activeTriggerElement() as HTMLElement | null}
      nextFocusableElement={
        parent().type === undefined ? store.context.triggerFocusTargetRef : undefined
      }
      beforeContentFocusGuardRef={store.context.beforeContentFocusGuardRef}
    >
      {element}
    </FloatingFocusManager>
  );
}

const NO_PARENT_HANDOFF: MenuFilterParentHandoff = {
  parentVirtualFocusRef: undefined,
  handleFocus: undefined,
};

function useNoParentHandoff() {
  return NO_PARENT_HANDOFF;
}

/**
 * A container for the menu items.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuPopup(props: MenuPopup.Props): JSX.Element {
  const Popup = useMenuFilterImpl()?.Popup ?? MenuPopupPlain;
  return <Popup {...props} />;
}

export interface MenuPopupProps extends BaseUIComponentProps<'div', MenuPopupState> {
  children?: JSX.Element;
  /**
   * @ignore
   */
  id?: string | undefined;
  /**
   * Determines the element to focus when the menu is closed.
   *
   * - `false`: Do not move focus.
   * - `true`: Move focus based on the default behavior (trigger or previously focused element).
   * - `RefObject`: Move focus to the ref element.
   * - `function`: Called with the interaction type (`mouse`, `touch`, `pen`, or `keyboard`).
   *   Return an element to focus, `true` to use the default behavior, or `false`/`undefined` to do nothing.
   */
  finalFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((closeType: InteractionType) => boolean | HTMLElement | null | void)
    | undefined;
}

export interface MenuPopupState {
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side;
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the menu is currently open.
   */
  open: boolean;
  /**
   * Whether the component is nested.
   */
  nested: boolean;
  /**
   * Whether transitions should be skipped.
   */
  instant: 'dismiss' | 'click' | 'group' | 'trigger-change' | undefined;
}

export namespace MenuPopup {
  export type Props = MenuPopupProps;
  export type State = MenuPopupState;
}
