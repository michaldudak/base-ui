import { untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { MenuRootInternal } from '../root/MenuRoot';
import type { MenuRoot } from '../root/MenuRoot';
import type { MenuFilterProviderOptions } from '../filter-provider/MenuFilterProviderOptions';
import { MenuFilterDropdown } from './MenuFilterDropdown';
import { useMenuFilterRoot } from './useMenuFilterRoot';
import type { PayloadChildRenderFunction } from '../../utils/popups/popupRoot';

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
            // As in `renderPopupRootChildren`, only a function that declares a parameter is a
            // payload render function; a lone component child can resolve to an accessor (a
            // `<Show>` returns a memo), which is left for Solid to insert reactively.
            return isPayloadRenderFunction(content) ? untrack(() => content(payload)) : content;
          })()}
        </MenuFilterDropdown>
      )}
    </MenuRootInternal>
  );
}

function isPayloadRenderFunction<Payload>(
  content: MenuRoot.Props<Payload>['children'],
): content is PayloadChildRenderFunction<Payload> {
  return typeof content === 'function' && content.length > 0;
}

export type MenuFilterRootProps<Payload = unknown> = MenuRoot.Props<Payload> &
  MenuFilterProviderOptions;
