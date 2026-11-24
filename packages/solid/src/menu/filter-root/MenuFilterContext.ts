import { createContext, untrack, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { MenuRootContext } from '../root/MenuRootContext';
import type { HTMLProps } from '../../internals/types';
import type { MaybeAccessor } from '#utils/access';
import type { MenuPopup } from '../popup/MenuPopup';
import type { MenuGroup } from '../group/MenuGroup';
import type { MenuRadioGroup } from '../radio-group/MenuRadioGroup';
import type { MenuParent } from '../root/MenuRoot';
import type { MenuStore } from '../store/MenuStore';

// Solid port: the filtering parts (`MenuFilterPopup`, `MenuFilterGroup`, `MenuFilterRadioGroup`,
// `MenuFilterList`) are not ported yet. They take the props of the plain part they replace, which
// is what the plain parts hand them; `Menu.List` is not ported either, so its props are loosened.
type MenuFilterPopupComponent = (props: MenuPopup.Props) => JSX.Element;
type MenuFilterListComponent = (props: any) => JSX.Element;
type MenuFilterGroupComponent = (props: MenuGroup.Props) => JSX.Element;
type MenuFilterRadioGroupComponent = <Value = any>(
  props: MenuRadioGroup.Props<Value>,
) => JSX.Element;

/**
 * Solid port: the fields are read lazily (the item parts pass an object with getters), so the
 * implementation reads them where it needs them, inside a tracking scope.
 */
export interface MenuFilterItemParams {
  label?: string | undefined;
  children?: JSX.Element;
  render?: unknown;
}

export interface MenuFilterItemResult {
  /** Whether the item matches the query. A hidden item renders nothing. */
  visible: Accessor<boolean>;
  /** Registers the element with the filter. */
  ref: ((element: HTMLElement) => void) | ((element: HTMLElement) => void)[] | null;
  /** Props the filter needs on the element, merged under the consumer's. */
  props?: Accessor<HTMLProps> | undefined;
}

/**
 * The filter implementation that a filterable root hands to the parts below it. Only the roots
 * `Menu.FilterProvider` renders import it, so a plain menu never bundles it. Parts whose whole
 * structure differs are swapped as components; parts that only register with the filter call an
 * injected hook, so a menu that never renders them doesn't bundle a second implementation.
 */
export interface MenuFilterImpl {
  Popup: MenuFilterPopupComponent;
  List: MenuFilterListComponent;
  Group: MenuFilterGroupComponent;
  RadioGroup: MenuFilterRadioGroupComponent;
  /** Registers an item with the filter and reports whether it matches the query. */
  useItem: (params: MenuFilterItemParams) => MenuFilterItemResult;
  /** Like `useItem` for a submenu trigger, which is an item of the parent list. */
  useSubmenuTrigger: (params: MenuFilterItemParams) => MenuFilterItemResult;
  /** Hands focus and the highlight back to a filterable parent when a plain submenu closes. */
  useParentHandoff: (
    store: MenuStore<unknown>,
    parent: MaybeAccessor<MenuParent>,
    open: MaybeAccessor<boolean>,
    virtualFocus: MaybeAccessor<boolean>,
  ) => MenuFilterParentHandoff;
}

export interface MenuFilterParentHandoff {
  /** The filterable parent's input, which the closing submenu returns focus to. */
  parentVirtualFocusRef: { current: HTMLElement | null } | undefined;
  handleFocus: (() => void) | undefined;
}

/** Static below a filter root: the implementation never changes, so subscribers never re-render. */
export const MenuFilterImplContext = createContext<MenuFilterImpl | null>(null);

export type MenuFilterPartScope =
  /** The part belongs to the nearest root. */
  | 'root'
  /** The part is an item of the parent list but renders inside its own submenu root. */
  | 'submenu-trigger';

/**
 * The filter implementation when the menu this part belongs to is filterable, otherwise `null`.
 * `virtualFocus` marks a filter root; a plain `Menu.Root` never sets it. The result is fixed for
 * a mounted part: a filter root can't appear above it without remounting it.
 */
export function useMenuFilterImpl(scope: MenuFilterPartScope = 'root'): MenuFilterImpl | null {
  const impl = useContext(MenuFilterImplContext);
  const root = useContext(MenuRootContext) ?? undefined;

  if (impl === null || root === undefined) {
    return null;
  }

  // Read once: the result is fixed for a mounted part (see above).
  const filterable = untrack(() =>
    scope === 'submenu-trigger'
      ? root.virtualFocus() || root.parentVirtualFocus()
      : root.virtualFocus(),
  );
  return filterable ? impl : null;
}

/**
 * Throws unless the menu this part renders in is filterable, naming the part and the provider.
 */
export function useMenuFilterPart(part: string) {
  if (useMenuFilterImpl() === null) {
    throw new Error(
      `Base UI: <Menu.${part}> must be placed in a menu wrapped in <Menu.FilterProvider>. ` +
        'It reads the filter query and the matching items from the provider, which a plain menu ' +
        'does not have. Wrap the <Menu.Root> or <Menu.SubmenuRoot> it belongs to in ' +
        '<Menu.FilterProvider>. See https://base-ui.com/react/components/menu#filtering',
    );
  }
}

const UNFILTERED: MenuFilterItemResult = { visible: () => true, ref: null };

function useUnfilteredItem(): MenuFilterItemResult {
  return UNFILTERED;
}

/**
 * Registers an item part with the filter of the menu it belongs to. A plain menu's items are
 * always visible.
 *
 * Solid port: `props` is the part's props object, read lazily. `forwardedRef` reads the part's own
 * `ref` prop (`() => props.ref`); the returned `ref` calls it and the filter's, and the part
 * renders its plain implementation with it in place of its `ref` prop.
 */
export function useMenuFilterItem(
  props: MenuFilterItemParams,
  forwardedRef: Accessor<JSX.Ref<HTMLElement> | undefined>,
  scope: MenuFilterPartScope = 'root',
): MenuFilterItemResult {
  const impl = useMenuFilterImpl(scope);

  const useItem =
    (scope === 'submenu-trigger' ? impl?.useSubmenuTrigger : impl?.useItem) ?? useUnfilteredItem;
  const item = useItem({
    get label() {
      return props.label;
    },
    get children() {
      return props.children;
    },
    get render() {
      return props.render;
    },
  });
  const ref = (element: HTMLElement) => {
    callRef(untrack(forwardedRef), element);
    callRef(item.ref, element);
  };

  return { visible: item.visible, ref, props: item.props };
}

function callRef(ref: JSX.Ref<HTMLElement> | null, element: HTMLElement) {
  if (Array.isArray(ref)) {
    for (let i = 0; i < ref.length; i += 1) {
      callRef(ref[i], element);
    }
  } else if (typeof ref === 'function') {
    ref(element);
  }
}
