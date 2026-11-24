import type { JSX } from '@solidjs/web';
import type { BaseUIEvent, ComponentRenderFn, HTMLProps } from '../types';

export type { HTMLProps, BaseUIEvent, ComponentRenderFn };

export type MaybeBaseUIEvent<E extends Event> = E &
  Partial<Pick<BaseUIEvent<E>, 'preventBaseUIHandler' | 'baseUIHandlerPrevented'>>;

export interface FloatingUIOpenChangeDetails {
  open: boolean;
  reason: string;
  nativeEvent: Event;
  nested: boolean;
  triggerElement?: Element | undefined;
}

type BaseUIEventExtras = Pick<
  BaseUIEvent<Event>,
  'preventBaseUIHandler' | 'baseUIHandlerPrevented'
>;

/**
 * The event a Solid event handler type receives (with its `currentTarget` and `target` typing).
 */
type HandlerEvent<Handler> =
  Extract<Handler, (...args: any[]) => any> extends (event: infer E) => any ? E : never;

type WithPreventBaseUIHandler<Handler> = [HandlerEvent<Handler>] extends [never]
  ? Handler
  : | ((event: HandlerEvent<Handler> & BaseUIEventExtras) => void)
    | [(data: any, event: HandlerEvent<Handler> & BaseUIEventExtras) => void, any]
    | undefined;

/**
 * Adds a `preventBaseUIHandler` method to the events of all event handlers.
 */
export type WithBaseUIEvent<T> = {
  [K in keyof T]: K extends `on${Capitalize<string>}` ? WithPreventBaseUIHandler<T[K]> : T[K];
};

type IntrinsicElementProps<Tag extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[Tag];

/**
 * Props shared by all Base UI components.
 * Contains `class` (a class value or a callback taking the component's state as an argument) and
 * `render` (to customize the rendered element).
 */
export type BaseUIComponentProps<
  Tag extends keyof JSX.IntrinsicElements,
  State,
  RenderFunctionProps = HTMLProps,
> = Omit<WithBaseUIEvent<IntrinsicElementProps<Tag>>, 'class' | 'style' | 'children'> & {
  /**
   * CSS class applied to the element, or a function that
   * returns a class based on the component's state.
   */
  class?: JSX.HTMLAttributes<any>['class'] | ((state: State) => string | undefined) | undefined;
  /**
   * Allows you to replace the component's HTML element
   * with a different tag, or compose it with another component.
   *
   * Accepts a tag name, a component, or a function that receives the props to spread
   * and the component's state and returns the element to render.
   */
  render?: keyof JSX.IntrinsicElements | ComponentRenderFn<RenderFunctionProps, State> | undefined;
  /**
   * Style applied to the element, or a function that
   * returns a style object based on the component's state.
   */
  style?:
    | JSX.CSSProperties
    | string
    | ((state: State) => JSX.CSSProperties | string | undefined)
    | undefined;
  /**
   * The content of the component.
   */
  children?: JSX.Element;
};

export interface NativeButtonProps {
  /**
   * Whether the component renders a native `<button>` element when replacing it
   * via the `render` prop.
   * Set to `false` if the rendered element is not a button (for example, `<div>`).
   * @default true
   */
  nativeButton?: boolean | undefined;
}

export interface NonNativeButtonProps {
  /**
   * Whether the component renders a native `<button>` element when replacing it
   * via the `render` prop.
   * Set to `true` if the rendered element is a native button.
   * @default false
   */
  nativeButton?: boolean | undefined;
}

/**
 * Simplifies the display of a type (without modifying it).
 * Taken from https://effectivetypescript.com/2022/02/25/gentips-4-display/
 */
export type Simplify<T> = T extends Function ? T : { [K in keyof T]: T[K] };

/**
 * Makes specified keys in a type required.
 *
 * @template T - The original type.
 * @template K - The keys to make required.
 */
export type RequiredExcept<T, K extends keyof T> = Required<Omit<T, K>> & Pick<T, K>;

export type Orientation = 'horizontal' | 'vertical';
