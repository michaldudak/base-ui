import { omit, onCleanup, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { useMenuFilterImpl } from '../filter-root/MenuFilterContext';
import { useMenuRootContext } from '../root/MenuRootContext';
import { useRenderElement } from '../../internals/useRenderElement';
import { useBaseUiId } from '../../internals/useBaseUiId';
import type { BaseUIComponentProps } from '../../internals/types';
import { resolvePopupLabel } from '../../internals/resolvePopupLabel';

function MenuListPlain(componentProps: MenuList.Props): JSX.Element {
  const elementProps = omit(componentProps, 'render', 'class', 'style', 'id');

  const { store, orientation } = useMenuRootContext();

  const activeTriggerId = store.useState('activeTriggerId');
  const activeTriggerElement = store.useState('activeTriggerElement');
  const setListElement = (element: HTMLElement | null) => {
    store.set('listElement', element);
  };
  // Solid port: a ref is never called with `null`, so the removal is handled here.
  onCleanup(() => setListElement(null));

  const id = useBaseUiId(() => {
    // Solid port: `false` (Solid's way to remove an attribute) counts as not set.
    const idProp = componentProps.id;
    return idProp === false ? undefined : idProp;
  });

  // The trigger reads `aria-controls` off the stored element, which an id change alone leaves in
  // place, so subscribers are told to read it again. Mounting publishes the element itself.
  // Solid port: the initial value is read once.
  const renderedIdRef = { current: untrack(id) };
  useIsoLayoutEffect(
    () => [id()] as const,
    ([currentId]) => {
      if (renderedIdRef.current !== currentId) {
        renderedIdRef.current = currentId;
        store.notifyAll();
      }
    },
  );

  const ariaLabelledBy = () =>
    resolvePopupLabel(componentProps, activeTriggerElement(), activeTriggerId());

  return useRenderElement('div', componentProps, {
    ref: setListElement,
    props: () => [
      {
        id: id(),
        role: 'menu',
        // The popup focuses the list on a pointer open in place of itself.
        tabindex: -1,
        // `menu` is implicitly vertical, so only the non-default value needs to be rendered.
        'aria-orientation': orientation() === 'horizontal' ? 'horizontal' : undefined,
        'aria-labelledby': ariaLabelledBy(),
      },
      elementProps,
    ],
  });
}

/**
 * Groups menu items so other content, such as a filter input, can share the popup.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuList(props: MenuList.Props): JSX.Element {
  const List = useMenuFilterImpl()?.List ?? MenuListPlain;
  return <List {...props} />;
}

export interface MenuListState {}

export interface MenuListProps extends BaseUIComponentProps<'div', MenuListState> {}

export namespace MenuList {
  export type Props = MenuListProps;
  export type State = MenuListState;
}
