import type { JSX } from '@solidjs/web';

export type {
  BaseUIChangeEventDetails,
  BaseUIGenericEventDetails,
} from '../internals/createBaseUIEventDetails';

/**
 * Props that can be spread on an HTML element.
 * Internal prop bundles are loosely typed: they hold attributes, `data-*` values and event handlers.
 */
export type HTMLProps<T = any> = JSX.HTMLAttributes<T> & Record<string, any>;

/**
 * Shape of the function form of the `render` prop: a function that takes props to be spread on
 * the element and the component's state, and returns the element to render.
 *
 * `props` and `state` are reactive objects. Spread `props` on the element (`<a {...props} />`) and
 * read `state` fields where they are used; do not destructure either of them.
 *
 * @template Props Props to be spread on the rendered element.
 * @template State Component's internal state.
 */
export type ComponentRenderFn<Props, State> = (props: Props, state: State) => JSX.Element;

/**
 * An event received by a handler passed to a Base UI component.
 * Calling `preventBaseUIHandler()` skips the component's own handler for that event.
 */
export type BaseUIEvent<E extends Event = Event> = E & {
  preventBaseUIHandler: () => void;
  readonly baseUIHandlerPrevented?: boolean | undefined;
};
