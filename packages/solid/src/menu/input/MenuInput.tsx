import { createMemo, onCleanup } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { ownerDocument } from '#utils/owner';
import { activeElement } from '#utils/shadowDom';
import { FilterDropdownInput } from '../../filter-dropdown/input/FilterDropdownInput';
import type {
  FilterDropdownInputProps,
  FilterDropdownInputState,
} from '../../filter-dropdown/input/FilterDropdownInput';
import { useFilterDropdownValueContext } from '../../filter-dropdown/root/FilterDropdownRootContext';
import type { HTMLProps } from '../../internals/types';
import { useMenuFilterKeyDown } from '../filter-root/useMenuFilterKeyDown';
import { useMenuFilterPart } from '../filter-root/MenuFilterContext';
import { useMenuRootContext } from '../root/MenuRootContext';

/**
 * A search field that filters the menu items.
 * Requires the menu to be wrapped in `Menu.FilterProvider`.
 * Renders an `<input>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuInput(componentProps: MenuInput.Props): JSX.Element {
  useMenuFilterPart('Input');
  const { store } = useMenuRootContext();
  const value = useFilterDropdownValueContext();

  const inputProps = store.useState('inputProps');
  const navigationProps = createMemo(() => {
    const { onKeyDown, ...otherProps } = inputProps();
    return otherProps;
  });
  const activeItemId = store.useState('highlightedItemId');

  const handleKeyDown = useMenuFilterKeyDown(() => value() !== '');
  const handleInputRef = (input: HTMLInputElement) => {
    // Ref changes cover input removal without blur and restore focus after Strict Mode replay.
    store.set('inputFocused', activeElement(ownerDocument(input)) === input);
  };
  // Solid port: a ref is never called with `null`, so the removal is handled here.
  onCleanup(() => {
    store.set('inputFocused', false);
  });

  // Solid port: merged under the consumer's props by `FilterDropdownInput`, which is what
  // `mergeProps(hostProps, componentProps)` does in React.
  const hostProps: HTMLProps = {
    ref: handleInputRef,
    onKeyDown: handleKeyDown,
    onFocus() {
      store.set('inputFocused', true);
    },
    onBlur() {
      store.set('inputFocused', false);
    },
  };

  return (
    <FilterDropdownInput
      {...componentProps}
      hostProps={hostProps}
      activeItemId={activeItemId()}
      navigationProps={navigationProps()}
    />
  );
}

export interface MenuInputState extends FilterDropdownInputState {}
export interface MenuInputProps extends FilterDropdownInputProps {}

export namespace MenuInput {
  export type State = MenuInputState;
  export type Props = MenuInputProps;
}
