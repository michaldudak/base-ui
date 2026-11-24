import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import { isElementDisabled } from '#utils/isElementDisabled';
import { useCompositeRootContext } from '../root/CompositeRootContext';
import { useCompositeListItem } from '../list/useCompositeListItem';
import type { UseCompositeListItemParameters } from '../list/useCompositeListItem';
import type { HTMLProps } from '../../types';

export interface UseCompositeItemParameters<Metadata> extends Pick<
  UseCompositeListItemParameters<Metadata>,
  'metadata'
> {}

export function useCompositeItem<Metadata>(params: UseCompositeItemParameters<Metadata> = {}): {
  compositeProps: Accessor<HTMLProps>;
  compositeRef: (element: HTMLElement) => void;
  index: Accessor<number>;
} {
  const { highlightItemOnHover, highlightedIndex, onHighlightedIndexChange } =
    useCompositeRootContext();
  const { ref, index } = useCompositeListItem(params);

  const isHighlighted = () => highlightedIndex() === index();

  const itemRef = { current: null as HTMLElement | null };
  const mergedRef = (element: HTMLElement) => {
    ref(element);
    itemRef.current = element;
  };

  const onFocus = () => {
    onHighlightedIndexChange(index());
  };

  const onMouseMove = () => {
    const item = itemRef.current;
    if (!highlightItemOnHover() || !item) {
      return;
    }

    if (!isHighlighted() && !isElementDisabled(item)) {
      item.focus();
    }
  };

  const compositeProps = createMemo<HTMLProps>(() => ({
    tabindex: isHighlighted() ? 0 : -1,
    onFocus,
    onMouseMove,
  }));

  return {
    compositeProps,
    compositeRef: mergedRef,
    index,
  };
}
