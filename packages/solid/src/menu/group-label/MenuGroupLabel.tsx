import { omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useIsoLayoutEffect } from '#utils/useEffect';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { useMenuGroupRootContext } from '../group/MenuGroupContext';

/**
 * An accessible label that is automatically associated with its parent group.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuGroupLabel(componentProps: MenuGroupLabel.Props): JSX.Element {
  const elementProps = omit(componentProps, 'render', 'class', 'style', 'id');

  // `id` may be `false` in Solid's typings (an attribute to remove), which means no override.
  const id = useBaseUiId(() => {
    const idProp = componentProps.id;
    return idProp === false ? undefined : idProp;
  });

  const setLabelId = useMenuGroupRootContext();

  useIsoLayoutEffect(
    () => [id()] as const,
    ([currentLabelId]) => {
      setLabelId(currentLabelId);
      return () => {
        setLabelId((currentId) => (currentId === currentLabelId ? undefined : currentId));
      };
    },
  );

  return useRenderElement('div', componentProps, {
    props: () => [
      {
        id: id(),
        'aria-hidden': true,
      },
      elementProps,
    ],
  });
}

export interface MenuGroupLabelProps extends BaseUIComponentProps<'div', MenuGroupLabelState> {}

export interface MenuGroupLabelState {}

export namespace MenuGroupLabel {
  export type Props = MenuGroupLabelProps;
  export type State = MenuGroupLabelState;
}
