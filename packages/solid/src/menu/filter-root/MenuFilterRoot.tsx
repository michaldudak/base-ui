import { untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { MenuRootInternal } from '../root/MenuRoot';
import type { MenuRoot } from '../root/MenuRoot';
import type { MenuFilterProviderOptions } from '../filter-provider/MenuFilterProviderOptions';
import { MenuFilterDropdown } from './MenuFilterDropdown';
import { useMenuFilterRoot } from './useMenuFilterRoot';

/**
 * The filterable implementation of `Menu.Root`, rendered in its place when the root sits inside
 * `Menu.FilterProvider`. Reached through the provider only, so a plain menu never bundles it.
 *
 * @internal
 */
export function MenuFilterRoot<Payload>(props: MenuFilterRootProps<Payload>): JSX.Element {
  const { children, rootProps, dropdownProps } = useMenuFilterRoot(props);

  return (
    <MenuRootInternal<Payload> {...rootProps}>
      {(payload: { payload: Payload | undefined }) => (
        <MenuFilterDropdown {...dropdownProps}>
          {(() => {
            const content = children();
            // Called like a component: reads made in its body don't re-run this expression.
            return typeof content === 'function' ? untrack(() => content(payload)) : content;
          })()}
        </MenuFilterDropdown>
      )}
    </MenuRootInternal>
  );
}

export type MenuFilterRootProps<Payload = unknown> = MenuRoot.Props<Payload> &
  MenuFilterProviderOptions;
