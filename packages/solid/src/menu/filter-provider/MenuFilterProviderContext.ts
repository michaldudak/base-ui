import { createContext } from 'solid-js';
import type { JSX } from '@solidjs/web';

// Solid port: the filtering parts (`MenuFilterRoot`, `MenuFilterSubmenuRoot`,
// `MenuFilterProviderOptions`) are not ported yet, so their types are loosened here.
type MenuFilterRootComponent = (props: any) => JSX.Element;
type MenuFilterProviderOptions = Record<string, unknown>;

/**
 * What `Menu.FilterProvider` hands to the root directly inside it: the filterable root
 * implementations (the provider is their only importer) and the filter props.
 */
export interface MenuFilterProviderContext {
  Root: MenuFilterRootComponent;
  SubmenuRoot: MenuFilterRootComponent;
  options: MenuFilterProviderOptions;
}

/**
 * Non-null only directly below a provider. The root that consumes it resets it, so a plain
 * `Menu.SubmenuRoot` inside a filterable menu stays plain.
 */
export const MenuFilterProviderContext = createContext<MenuFilterProviderContext | null>(null);
