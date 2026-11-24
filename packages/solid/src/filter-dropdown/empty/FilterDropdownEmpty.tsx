import { createSignal, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useIsoLayoutEffect } from '#utils/useEffect';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import { useFilterDropdownItemContext } from '../root/FilterDropdownRootContext';
import { useInitialLiveRegionTextMutation } from '../../internals/useInitialLiveRegionTextMutation';

/**
 * @internal
 */
export function FilterDropdownEmpty(componentProps: FilterDropdownEmpty.Props): JSX.Element {
  const elementProps = omit(componentProps, 'render', 'class', 'style');

  const { store } = useFilterDropdownItemContext();

  const isEmpty = store.useState('isEmpty');

  // Items mounting in the same commit register in layout effects, after this first render, and
  // don't register on the server at all. Deciding once they have keeps the children from
  // mounting for a frame on every open, and the message out of server markup.
  const [ready, setReady] = createSignal(false, { ownedWrite: true });
  useIsoLayoutEffect(
    () => [],
    () => {
      setReady(true);
    },
  );

  const visible = () => ready() && isEmpty();

  const emptyRef = useInitialLiveRegionTextMutation<HTMLDivElement>(visible);

  return useRenderElement('div', componentProps, {
    enabled: visible,
    ref: (element: HTMLDivElement) => {
      emptyRef.current = element;
    },
    props: () => [
      {
        role: 'status',
        'aria-live': 'polite',
        'aria-atomic': true,
      },
      elementProps,
    ],
  });
}

export interface FilterDropdownEmptyState {}

export interface FilterDropdownEmptyProps extends BaseUIComponentProps<
  'div',
  FilterDropdownEmptyState
> {}

export namespace FilterDropdownEmpty {
  export type Props = FilterDropdownEmptyProps;
  export type State = FilterDropdownEmptyState;
}
