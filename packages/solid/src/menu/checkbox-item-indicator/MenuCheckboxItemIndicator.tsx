import { omit, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useMenuCheckboxItemContext } from '../checkbox-item/MenuCheckboxItemContext';
import { useRenderElement } from '../../internals/useRenderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { itemMapping } from '../utils/stateAttributesMapping';
import type { TransitionStatus } from '../../internals/useTransitionStatus';
import { useTransitionStatus } from '../../internals/useTransitionStatus';
import { useOpenChangeComplete } from '../../internals/useOpenChangeComplete';

/**
 * Indicates whether the checkbox item is ticked.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuCheckboxItemIndicator(
  componentProps: MenuCheckboxItemIndicator.Props,
): JSX.Element {
  const elementProps = omit(componentProps, 'render', 'class', 'style', 'keepMounted');

  const item = useMenuCheckboxItemContext();

  const indicatorRef = { current: null as HTMLSpanElement | null };

  const { transitionStatus, mounted, setMounted } = useTransitionStatus(() => item.checked());

  useOpenChangeComplete({
    batch: true,
    enabled: () => !item.checked(),
    open: () => item.checked(),
    ref: indicatorRef,
    onComplete() {
      // May run inside the effect that starts the wait: read the latest value untracked.
      if (!untrack(item.checked)) {
        setMounted(false);
      }
    },
  });

  const state: MenuCheckboxItemIndicatorState = {
    get checked() {
      return item.checked();
    },
    get disabled() {
      return item.disabled();
    },
    get highlighted() {
      return item.highlighted();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  const element = useRenderElement('span', componentProps, {
    state,
    ref: (element: HTMLSpanElement) => {
      indicatorRef.current = element;
    },
    stateAttributesMapping: itemMapping,
    props: () => [
      {
        'aria-hidden': true,
      },
      elementProps,
    ],
    enabled: () => (componentProps.keepMounted ?? false) || mounted(),
  });

  return element;
}

export interface MenuCheckboxItemIndicatorProps extends BaseUIComponentProps<
  'span',
  MenuCheckboxItemIndicatorState
> {
  /**
   * Whether to keep the HTML element in the DOM when the checkbox item is not checked.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export interface MenuCheckboxItemIndicatorState {
  /**
   * Whether the checkbox item is currently ticked.
   */
  checked: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the item is highlighted.
   */
  highlighted: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export namespace MenuCheckboxItemIndicator {
  export type Props = MenuCheckboxItemIndicatorProps;
  export type State = MenuCheckboxItemIndicatorState;
}
