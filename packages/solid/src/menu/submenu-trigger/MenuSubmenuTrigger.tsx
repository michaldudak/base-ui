import { createMemo, omit, onCleanup, Show, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { isElementDisabled } from '#utils/isElementDisabled';
import { warn } from '#utils/warn';
import { EMPTY_OBJECT } from '#utils/empty';
import { platform } from '#utils/platform';
import { useEffect, useIsoLayoutEffect } from '#utils/useEffect';
import { getTarget } from '#utils/shadowDom';
import { useMenuFilterItem } from '../filter-root/MenuFilterContext';
import { safePolygon } from '../../utils/popups/interactions/safePolygon';
import { useClick } from '../../utils/popups/interactions/useClick';
import { useHoverTriggerInteraction } from '../../utils/popups/interactions/useHoverTriggerInteraction';
import type { BaseUIComponentProps, HTMLProps, NonNativeButtonProps } from '../../internals/types';
import { useMenuRootContext } from '../root/MenuRootContext';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { triggerOpenStateMapping } from '../../utils/popups/popupStateMapping';
import { useCompositeListItem } from '../../internals/composite/list/useCompositeListItem';
import { useMenuItem } from '../item/useMenuItem';
import { useRenderElement } from '../../internals/useRenderElement';
import { useMenuPositionerContext } from '../positioner/MenuPositionerContext';
import { useTriggerRegistration } from '../../utils/popups/popupStoreUtils';
import { useMenuSubmenuRootContext } from '../submenu-root/MenuSubmenuRootContext';
import { REASONS } from '../../internals/reasons';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';

const VOICE_OVER_EXPANDED_PROPS = { 'aria-expanded': undefined };

interface MenuSubmenuTriggerPlainProps extends MenuSubmenuTrigger.Props {
  /**
   * Solid port: the props a filterable parent adds to the trigger. React merges them into the
   * component's props (`mergeProps(filterItem.props, props)`), under the consumer's.
   */
  filterItemProps?: Accessor<HTMLProps> | undefined;
}

function MenuSubmenuTriggerPlain(componentProps: MenuSubmenuTriggerPlainProps): JSX.Element {
  const elementProps = omit(
    componentProps,
    'render',
    'class',
    'style',
    'label',
    'id',
    'nativeButton',
    'openOnHover',
    'delay',
    'closeDelay',
    'disabled',
    'filterItemProps',
  );

  const openOnHover = () => componentProps.openOnHover ?? true;
  const delay = () => componentProps.delay ?? 100;
  const closeDelay = () => componentProps.closeDelay ?? 0;

  const context = useMenuRootContext(true);
  // `parent` of the root context is fixed for the lifetime of the root.
  const contextParent = context?.parent();
  if (context === undefined || contextParent?.type !== 'menu') {
    throw new Error('Base UI: <Menu.SubmenuTrigger> must be placed in <Menu.SubmenuRoot>.');
  }

  const menuPositionerContext = useMenuPositionerContext();
  const submenuRootContext = useMenuSubmenuRootContext();

  const { store, parentVirtualFocus } = context;
  const parentMenuStore = contextParent.store;

  const listItem = useCompositeListItem({ guess: true, label: () => componentProps.label });
  const thisTriggerId = useBaseUiId(() => componentProps.id);

  const open = store.useState('open');
  const focusReturnedThroughGuardRef = { current: false };
  const positionerElement = store.useState('positionerElement');
  const floatingTreeRoot = store.useState('floatingTreeRoot');
  const popupId = store.useState('triggerPopupId', thisTriggerId);

  // A submenu has one trigger, so its menu belongs to it without being told (see the
  // `activeTriggerId` selector).
  const registerTrigger = useTriggerRegistration(thisTriggerId, store);

  const triggerElementRef: { current: HTMLElement | null } = { current: null };

  const handleTriggerElementRef = (el: HTMLElement | null) => {
    triggerElementRef.current = el;
  };
  onCleanup(() => handleTriggerElementRef(null));

  useIsoLayoutEffect(
    () => [open(), positionerElement()] as const,
    ([isOpen, currentPositionerElement]) => {
      if (!isOpen || !currentPositionerElement) {
        return undefined;
      }

      function handleGuardFocusOut(event: FocusEvent) {
        if (getTarget(event) === store.context.beforeContentFocusGuardRef.current) {
          focusReturnedThroughGuardRef.current = event.relatedTarget === triggerElementRef.current;
        }
      }

      // Observe focus leaving the guard inside its positioner. When the portal is in a shadow
      // root, the trigger's focus event can report the shadow host as `relatedTarget`, not the
      // guard.
      currentPositionerElement.addEventListener('focusout', handleGuardFocusOut, true);
      return () => {
        focusReturnedThroughGuardRef.current = false;
        currentPositionerElement.removeEventListener('focusout', handleGuardFocusOut, true);
      };
    },
  );

  store.useSyncedValue('closeDelay', closeDelay);

  const rootDisabled = store.useState('disabled');
  const parentDisabled = parentMenuStore.useState('disabled');

  const disabled = () => (componentProps.disabled ?? false) || rootDisabled() || parentDisabled();

  if (process.env.NODE_ENV !== 'production') {
    useEffect(
      () => [disabled()] as const,
      ([isDisabled]) => {
        const element = triggerElementRef.current;
        if (element && isElementDisabled(element) && !isDisabled) {
          warn(
            'A disabled element was detected on <Menu.SubmenuTrigger>. To properly disable the trigger, use the `disabled` prop on the component instead of setting it on the rendered element.',
          );
        }
      },
    );
  }

  const itemProps = parentMenuStore.useState('itemProps');
  const highlighted = parentMenuStore.useState('isActive', listItem.index);

  const itemMetadata = {
    type: 'submenu-trigger' as const,
    setActive(event: MouseEvent) {
      if (parentMenuStore.select('highlightItemOnHover')) {
        parentMenuStore.setActiveIndex(listItem.index(), REASONS.pointer, event);
      }
    },
  };

  const { getItemProps, itemRef } = useMenuItem({
    closeOnClick: false,
    disabled,
    highlighted,
    id: thisTriggerId,
    store,
    typingRef: parentMenuStore.context.typingRef,
    nativeButton: () => componentProps.nativeButton ?? false,
    itemMetadata,
    nodeId: () => menuPositionerContext?.context.nodeId,
  });

  const hoverEnabled = store.useState('hoverEnabled');

  const hoverProps = useHoverTriggerInteraction(store, {
    enabled: () => hoverEnabled() && openOnHover() && !disabled(),
    handleClose: safePolygon({ blockPointerEvents: true }),
    mouseOnly: true,
    move: true,
    restMs: delay,
    delay: () => ({ open: delay(), close: closeDelay() }),
    shouldOpen: () => (delay() > 0 ? parentMenuStore.select('allowMouseEnter') : true),
    triggerElementRef,
    externalTree: store.select('floatingTreeRoot'),
    // Chrome can drop the trigger's `mouseleave` during a fast pointer sweep,
    // leaving a stale submenu open (see #5152) — cancel from `mouseout` too.
    guardStaleOpen: true,
  });

  const click = useClick(store, {
    enabled: () => !disabled(),
    event: 'mousedown',
    // Without toggling, TalkBack users cannot close the submenu to reach the next parent menu
    // item: moving the virtual cursor outside does not close it, and moving forward again
    // re-enters the still-open submenu. Keep toggling enabled so activating its trigger closes it.
    // Toggling applies to touch and keyboard activation. In hover mode, mouse presses are
    // ignored and the first activation after hover-opening keeps the submenu open.
    toggle: true,
    ignoreMouse: openOnHover,
    stickIfOpen: openOnHover,
  });

  const localInteractionProps = () => click.reference?.() ?? EMPTY_OBJECT;

  const triggerProps = store.useState('triggerProps', true);
  // Solid port: React deletes `id` from the store's object in place; a copy is made instead.
  const rootTriggerProps = createMemo(() => {
    const { id, ...rest } = triggerProps();
    return rest;
  });

  const state: MenuSubmenuTriggerState = {
    get disabled() {
      return disabled();
    },
    get highlighted() {
      return highlighted();
    },
    get open() {
      return open();
    },
  };

  const openMethod = store.useState('openMethod');
  const lastOpenChangeReason = store.useState('lastOpenChangeReason');
  // Arrow keys open the submenu through list navigation without dispatching a click, so
  // `openMethod` stays null there; Enter and Space do dispatch one and report `keyboard`.
  const openedByKeyboard = () =>
    lastOpenChangeReason() === REASONS.listNavigation || openMethod() === 'keyboard';
  const shouldOmitExpanded = () => open() && openedByKeyboard() && platform.screenReader.voiceOver;
  const submenuKeyDownProps = submenuRootContext?.onTriggerKeyDown
    ? { onKeyDown: submenuRootContext.onTriggerKeyDown }
    : undefined;

  const onFocus = (event: FocusEvent) => {
    // Close when focus returns through the submenu's guard to its trigger. This also lets
    // screen reader users move past the trigger in the parent menu. Direct focus from a
    // submenu item, such as on hover, leaves the submenu open.
    if (store.select('open') && focusReturnedThroughGuardRef.current) {
      focusReturnedThroughGuardRef.current = false;
      store.setOpen(false, createChangeEventDetails(REASONS.focusOut, event));
    }
  };

  const clearHighlight = () => {
    if (parentMenuStore.select('activeIndex') === listItem.index()) {
      parentMenuStore.setActiveIndex(null, REASONS.none);
    }
  };

  const onBlur = (event: FocusEvent) => {
    if (!highlighted()) {
      return;
    }

    // A filtered submenu hands focus straight back to its input when the parent's list
    // navigation focuses this trigger (see `useMenuFilterSubmenuTrigger`). That blur arrives
    // while the effect that focused the trigger is still running, so the highlight is cleared
    // once it is done rather than in the middle of it: state written while effects run makes
    // them all run a second time.
    const focusOwner = store.context.virtualFocusRef?.current;
    if (focusOwner != null && event.relatedTarget === focusOwner) {
      queueMicrotask(clearHighlight);
      return;
    }

    parentMenuStore.setActiveIndex(null, REASONS.none);
  };

  return useRenderElement('div', componentProps, {
    state,
    stateAttributesMapping: triggerOpenStateMapping,
    props: () => [
      localInteractionProps(),
      hoverProps(),
      rootTriggerProps(),
      // MenuFilterSubmenuRoot overrides the generic trigger handler because entry and exit
      // depend on both the parent and child menu orientations.
      submenuKeyDownProps,
      itemProps(),
      // Opening a submenu changes the trigger's expanded state while the trigger still holds
      // focus, and VoiceOver announces that state change instead of the submenu item that focus
      // moves to a moment later, so the first item is never announced. Dropping the state while
      // the submenu is open avoids the announcement without claiming the submenu is collapsed;
      // `aria-haspopup` still conveys that the item opens a submenu.
      shouldOmitExpanded() ? VOICE_OVER_EXPANDED_PROPS : undefined,
      {
        'aria-controls': popupId(),
        // A virtually focused parent keeps real focus on its input, so the trigger must stay out
        // of the tab order.
        tabindex: parentVirtualFocus() || !(open() || highlighted()) ? -1 : 0,
        onFocus,
        onBlur,
      },
      componentProps.filterItemProps?.(),
      elementProps,
      // `getItemProps` stays last so `useButton` keeps gating consumer handlers while disabled.
      getItemProps,
    ],
    ref: [listItem.ref, itemRef, registerTrigger, handleTriggerElementRef],
  });
}

/**
 * A menu item that opens a submenu.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuSubmenuTrigger(props: MenuSubmenuTrigger.Props): JSX.Element {
  const filterItem = useMenuFilterItem(props, () => props.ref, 'submenu-trigger');

  return (
    <Show when={filterItem.visible()}>
      <MenuSubmenuTriggerPlain {...props} filterItemProps={filterItem.props} ref={filterItem.ref} />
    </Show>
  );
}

export interface MenuSubmenuTriggerState {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the item is highlighted.
   */
  highlighted: boolean;
  /**
   * Whether the menu is currently open.
   */
  open: boolean;
}

export interface MenuSubmenuTriggerProps
  extends NonNativeButtonProps, BaseUIComponentProps<'div', MenuSubmenuTriggerState> {
  onClick?: BaseUIComponentProps<'div', MenuSubmenuTriggerState>['onClick'] | undefined;
  /**
   * Overrides the text used for keyboard text navigation and filtering.
   * Falls back to the rendered text when not provided.
   */
  label?: string | undefined;
  /**
   * @ignore
   */
  id?: string | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
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
   * @default true
   */
  openOnHover?: boolean | undefined;
}

export namespace MenuSubmenuTrigger {
  export type Props = MenuSubmenuTriggerProps;
  export type State = MenuSubmenuTriggerState;
}
