import { omit, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { EMPTY_OBJECT, EMPTY_ARRAY } from '#utils/empty';
import { useRenderElement } from '../../useRenderElement';
import { useCompositeItem } from './useCompositeItem';
import type { BaseUIComponentProps } from '../../types';
import type { StateAttributesMapping } from '../../getStateAttributesProps';
import type { InputProps } from '../../../merge-props/mergeProps';

export function CompositeItem<Metadata, State extends Record<string, any>>(
  componentProps: CompositeItem.Props<Metadata, State>,
): JSX.Element {
  const elementProps = omit(
    componentProps,
    'render',
    'class',
    'style',
    'state',
    'props',
    'refs',
    'metadata',
    'stateAttributesMapping',
    'tag',
  );

  const { compositeProps, compositeRef } = useCompositeItem<Metadata>({
    metadata: () => componentProps.metadata,
  });

  // The tag, state object, refs and mapping are bound once, when the element is created.
  const tag = untrack(() => componentProps.tag) ?? 'div';
  const state = untrack(() => componentProps.state) ?? (EMPTY_OBJECT as State);
  const refs = untrack(() => componentProps.refs) ?? EMPTY_ARRAY;
  const stateAttributesMapping = untrack(() => componentProps.stateAttributesMapping);

  return useRenderElement(tag, componentProps, {
    state,
    // The composite ref attaches first so an outer item wins when nested items share a DOM node.
    ref: [compositeRef, ...refs],
    props: () => [compositeProps(), ...(componentProps.props ?? EMPTY_ARRAY), elementProps],
    stateAttributesMapping,
  });
}

export interface CompositeItemState {}

export interface CompositeItemProps<Metadata, State extends Record<string, any>> extends Pick<
  BaseUIComponentProps<any, State>,
  'render' | 'class' | 'style'
> {
  children?: JSX.Element;
  metadata?: Metadata | undefined;
  refs?: ((element: HTMLElement) => void)[] | undefined;
  props?: InputProps[] | undefined;
  state?: State | undefined;
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
  tag?: keyof JSX.IntrinsicElements | undefined;
}

export namespace CompositeItem {
  export type State = CompositeItemState;
  export type Props<Metadata, TState extends Record<string, any>> = CompositeItemProps<
    Metadata,
    TState
  >;
}
