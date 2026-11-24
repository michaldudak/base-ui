import type { JSX } from '@solidjs/web';
import { MenuFilterRoot } from '../filter-root/MenuFilterRoot';
import { MenuFilterSubmenuRoot } from '../filter-submenu-root/MenuFilterSubmenuRoot';
import type { MenuFilterProviderOptions } from './MenuFilterProviderOptions';
import { MenuFilterProviderContext } from './MenuFilterProviderContext';
import type { FilterDropdownRoot } from '../../filter-dropdown/root/FilterDropdownRootContext';

/**
 * Enables filtering for the menu or submenu it wraps. Add `Menu.Input` to the popup and place
 * its items in `Menu.List`.
 * Wrap each searchable submenu in its own provider.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuFilterProvider(props: MenuFilterProvider.Props): JSX.Element {
  // Solid port: a stable object whose options read the props lazily, so the root they are spread
  // on follows them.
  const contextValue: MenuFilterProviderContext = {
    Root: MenuFilterRoot,
    SubmenuRoot: MenuFilterSubmenuRoot,
    options: {
      get filter() {
        return props.filter;
      },
      get value() {
        return props.value;
      },
      get defaultValue() {
        return props.defaultValue;
      },
      get onValueChange() {
        return props.onValueChange;
      },
      get autoHighlight() {
        return props.autoHighlight;
      },
      get locale() {
        return props.locale;
      },
    },
  };

  return (
    <MenuFilterProviderContext value={contextValue}>{props.children}</MenuFilterProviderContext>
  );
}

export interface MenuFilterProviderState {}

export interface MenuFilterProviderProps extends MenuFilterProviderOptions {
  /**
   * The `<Menu.Root>` or `<Menu.SubmenuRoot>` to make filterable.
   */
  children?: JSX.Element;
}

export type MenuFilterProviderChangeEventReason = FilterDropdownRoot.ChangeEventReason;
export type MenuFilterProviderChangeEventDetails = FilterDropdownRoot.ChangeEventDetails;

export namespace MenuFilterProvider {
  export type State = MenuFilterProviderState;
  export type Props = MenuFilterProviderProps;
  export type ChangeEventReason = MenuFilterProviderChangeEventReason;
  export type ChangeEventDetails = MenuFilterProviderChangeEventDetails;
}
