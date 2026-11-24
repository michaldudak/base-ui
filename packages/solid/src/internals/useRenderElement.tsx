import { $PROXY, createMemo, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import { dynamic } from '@solidjs/web';
import type { JSX } from '@solidjs/web';
import { EMPTY_OBJECT } from '#utils/empty';
import type { ComponentRenderFn, HTMLProps } from './types';
import type { StateAttributesMapping } from './getStateAttributesProps';
import { getStateAttributesProps } from './getStateAttributesProps';
import { resolveClassName } from '../utils/resolveClassName';
import { resolveStyle } from '../utils/resolveStyle';
import { mergeClassNames, mergePropsN, mergeRefs, mergeStyles } from '../merge-props';
import type { InputProps } from '../merge-props';

type IntrinsicTagName = keyof JSX.IntrinsicElements;

type RefCallback<T> = ((element: T) => void) | undefined | null;

const BUTTON_DEFAULTS = { type: 'button' };
const IMG_DEFAULTS = { alt: '' };

/**
 * Renders a Base UI element.
 *
 * Unlike its React counterpart this is not a hook: it runs once, when the component is created,
 * and returns the element. Everything that can change later is read lazily:
 *
 * - `params.props` is evaluated in a memo, so the reactive values it reads keep the element's
 *   attributes up to date. Pass a function returning the sources when some of them are accessors.
 * - `params.state` is an object whose fields are getters; it feeds the `data-*` attributes and is
 *   handed to the `class`, `style` and `render` functions.
 *
 * @param element The default HTML element to render. Can be overridden by the `render` prop.
 * @param componentProps The component's props. Only `render`, `class`, `style`, `ref` and
 *   `children` are read from it.
 * @param params Additional parameters for rendering the element.
 */
export function useRenderElement<State extends Record<string, any>, RenderedElementType = any>(
  element: IntrinsicTagName | undefined,
  componentProps: UseRenderElementComponentProps<State>,
  params: UseRenderElementParameters<State, RenderedElementType> = {},
): JSX.Element {
  const state = (params.state ?? EMPTY_OBJECT) as State;
  const { stateAttributesMapping } = params;

  const isEnabled = createMemo((): boolean => {
    const enabled = params.enabled;
    return typeof enabled === 'function' ? enabled() : enabled !== false;
  });

  // Memos, so the element is only re-created when these actually change.
  const renderProp = createMemo(() => componentProps.render);

  const mergedProps = createMemo<HTMLProps>(() => {
    if (!isEnabled()) {
      return EMPTY_OBJECT as HTMLProps;
    }

    const stateProps = getStateAttributesProps(state, stateAttributesMapping);

    const sourceProps =
      typeof params.props === 'function'
        ? (params.props as () => InputProps | InputProps[])()
        : params.props;
    const sources: InputProps[] = [stateProps];
    const tag = renderProp() ?? element;
    if (tag === 'button') {
      sources.push(BUTTON_DEFAULTS);
    } else if (tag === 'img') {
      sources.push(IMG_DEFAULTS);
    }
    if (Array.isArray(sourceProps)) {
      for (let i = 0; i < sourceProps.length; i += 1) {
        sources.push(sourceProps[i]);
      }
    } else if (sourceProps) {
      sources.push(sourceProps);
    }

    const outProps = mergePropsN(sources);

    const className = resolveClassName(componentProps.class, state);
    if (className !== undefined) {
      outProps.class = mergeClassNames(outProps.class, className as any);
    }

    const style = resolveStyle(componentProps.style, state);
    if (style !== undefined) {
      outProps.style = mergeStyles(outProps.style, style as any);
    }

    return outProps;
  });

  // Refs are bound once, when the element is created.
  const refs = untrack(() =>
    mergeRefs(mergedProps().ref, componentProps.ref as RefCallback<any>, params.ref as any),
  );

  const readChildren = () => {
    if (params.children) {
      return params.children();
    }
    return componentProps.children;
  };

  const elementProps = createPropsProxy(mergedProps, refs, readChildren);

  // A memo so that a changed `render` prop, or reactive reads made directly in the body of a
  // render function, re-create the element like a React re-render would.
  return createMemo(() => {
    if (!isEnabled()) {
      return null;
    }

    const render = renderProp();
    if (typeof render === 'function') {
      return render(elementProps, state);
    }

    const Tag = dynamic(() => (render ?? element) as IntrinsicTagName);
    return <Tag {...(elementProps as any)} />;
  }) as unknown as JSX.Element;
}

/**
 * Presents the result of the merge as a reactive props object, the same shape Solid gives to
 * components. Spreading it (`<a {...props} />`) keeps the element's attributes in sync.
 */
function createPropsProxy(
  mergedProps: Accessor<HTMLProps>,
  refs: ((element: any) => void)[],
  readChildren: () => JSX.Element,
): HTMLProps {
  const get = (key: string) => {
    if (key === 'ref') {
      return refs;
    }
    if (key === 'children') {
      return readChildren();
    }
    return mergedProps()[key];
  };

  const has = (key: string) => key === 'ref' || key === 'children' || key in mergedProps();

  const proxy: HTMLProps = new Proxy(
    {},
    {
      get(_, key) {
        if (typeof key === 'string') {
          return get(key);
        }
        return key === $PROXY ? proxy : undefined;
      },
      has(_, key) {
        return typeof key === 'string' ? has(key) : key === $PROXY;
      },
      set() {
        return true;
      },
      deleteProperty() {
        return true;
      },
      ownKeys() {
        const keys = Object.keys(mergedProps());
        if (!keys.includes('ref')) {
          keys.push('ref');
        }
        keys.push('children');
        return keys;
      },
      getOwnPropertyDescriptor(_, key) {
        if (typeof key !== 'string' || !has(key)) {
          return undefined;
        }
        return { enumerable: true, configurable: true, get: () => get(key) };
      },
    },
  );

  return proxy;
}

export type UseRenderElementParameters<State, RenderedElementType = any> = {
  /**
   * If `false`, nothing is rendered. Can be an accessor to render conditionally.
   * @default true
   */
  enabled?: boolean | Accessor<boolean> | undefined;
  /**
   * The ref to apply to the rendered element.
   */
  ref?: RefCallback<RenderedElementType> | RefCallback<RenderedElementType>[] | undefined;
  /**
   * The state of the component: an object whose fields are getters.
   */
  state?: State | undefined;
  /**
   * Intrinsic props to be spread on the rendered element.
   * Later sources win; event handlers, `class`, `style` and `ref` are merged.
   * A source is an object or a prop getter (`(mergedProps) => props`).
   *
   * Pass a function returning the sources when they are produced by accessors
   * (`props: () => [triggerProps(), elementProps]`). A prop getter must be wrapped in an array.
   */
  props?: InputProps | InputProps[] | (() => InputProps | InputProps[]) | undefined;
  /**
   * A mapping of state to `data-*` attributes.
   */
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
  /**
   * Children to render instead of the component's own `children` prop.
   */
  children?: (() => JSX.Element) | undefined;
};

export interface UseRenderElementComponentProps<State> {
  /**
   * The class to apply to the rendered element.
   * Can be a class value or a function that accepts the state and returns a string.
   */
  class?: unknown;
  /**
   * The tag, component or render function to override the default element.
   */
  render?: undefined | IntrinsicTagName | ComponentRenderFn<any, State>;
  /**
   * The style to apply to the rendered element.
   * Can be a style value or a function that accepts the state and returns one.
   */
  style?: unknown;
  ref?: unknown;
  children?: JSX.Element;
}

export interface UseRenderElementState {}
