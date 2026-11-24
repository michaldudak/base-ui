import { onCleanup } from 'solid-js';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useButton } from '../../internals/use-button';
import { mergeProps } from '../../merge-props/mergeProps';
import type { HTMLProps } from '../../internals/types';
import type { MenuStore } from '../store/MenuStore';
import { useMenuItemCommonProps } from './useMenuItemCommonProps';

export const REGULAR_ITEM = {
  type: 'regular-item' as const,
};

export function useMenuItem(params: UseMenuItemParameters): UseMenuItemReturnValue {
  const { store, itemMetadata } = params;
  const typingRef = params.typingRef ?? store.context.typingRef;

  const itemRef = { current: null as HTMLElement | null };

  const { getButtonProps, buttonRef } = useButton({
    disabled: () => access(params.disabled),
    focusableWhenDisabled: true,
    native: () => access(params.nativeButton),
    composite: true,
  });

  const commonProps = useMenuItemCommonProps({
    closeOnClick: () => access(params.closeOnClick),
    highlighted: () => access(params.highlighted),
    id: () => access(params.id),
    nodeId: () => access(params.nodeId),
    store,
    typingRef,
    itemRef,
    itemMetadata,
  });

  function onMouseEnter(event: MouseEvent) {
    if (itemMetadata.type !== 'submenu-trigger') {
      return;
    }

    itemMetadata.setActive(event);
  }

  // Called inside the `props` function of `useRenderElement`, so the reactive reads of
  // `commonProps` and `getButtonProps` are tracked there.
  const getItemProps = (externalProps?: HTMLProps): HTMLProps => {
    return mergeProps(
      commonProps(),
      {
        onMouseEnter,
      },
      externalProps,
      getButtonProps,
    );
  };

  const mergedRef = (element: HTMLElement) => {
    itemRef.current = element;
    buttonRef(element);
  };

  onCleanup(() => {
    itemRef.current = null;
  });

  return {
    getItemProps,
    itemRef: mergedRef,
  };
}

export interface UseMenuItemParameters {
  /**
   * Whether to close the menu when the item is clicked.
   */
  closeOnClick: MaybeAccessor<boolean>;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: MaybeAccessor<boolean>;
  /**
   * Determines if the menu item is highlighted.
   */
  highlighted: MaybeAccessor<boolean>;
  /**
   * The id of the menu item.
   */
  id: MaybeAccessor<string | undefined>;
  /**
   * Whether the component renders a native `<button>` element when replacing it
   * via the `render` prop.
   * Set to `false` if the rendered element is not a button (for example, `<div>`).
   * @default false
   */
  nativeButton: MaybeAccessor<boolean>;
  /**
   * Additional data specific to the item type.
   */
  itemMetadata: UseMenuItemMetadata;
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
   * @default store.context.typingRef
   */
  typingRef?: { current: boolean } | undefined;
}

export type UseMenuItemMetadata =
  | typeof REGULAR_ITEM
  | {
      type: 'submenu-trigger';
      setActive: (event: MouseEvent) => void;
    };

export interface UseMenuItemReturnValue {
  /**
   * Resolver for the root slot's props.
   * @param externalProps event handlers for the root slot
   * @returns props that should be spread on the root slot
   */
  getItemProps: (externalProps?: HTMLProps) => HTMLProps;
  /**
   * The ref to the component's root DOM element.
   */
  itemRef: ((element: HTMLElement) => void) | null;
}

export interface UseMenuItemState {}
