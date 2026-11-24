import type { BaseUIEvent, HTMLProps } from '../internals/types';

/**
 * A source of props: an object, or a function that receives the props merged so far and returns
 * the next merged props (a "prop getter").
 */
export type InputProps = object | ((otherProps: HTMLProps) => HTMLProps) | undefined | null;

const EMPTY_PROPS = {};

/**
 * Merges multiple sets of props. It follows the Object.assign pattern where the rightmost object's
 * fields overwrite the conflicting ones from others. This doesn't apply to event handlers, `class`,
 * `style` and `ref` props.
 *
 * Event handlers are merged and called in right-to-left order (rightmost handler executes first,
 * leftmost last). A handler can call `event.preventBaseUIHandler()` to skip the handlers to its
 * left. Solid's bound handler form (`[handler, data]`) is supported.
 *
 * The `class` prop is merged so the rightmost value comes first, the `style` prop is merged with
 * rightmost styles overwriting the others, and `ref` callbacks are combined.
 *
 * Props can either be provided as objects or as functions that take the previous props as an
 * argument. Function sources receive the merged props up to that point and their return value
 * replaces them; event handlers they return are not merged automatically.
 *
 * The result is a plain object: reactive values are read while merging. Call it inside a tracking
 * scope (a memo, JSX) to keep the result up to date.
 *
 * @important **`ref` callbacks are combined into an array**, which is the form Solid's `ref` prop
 * accepts.
 */
export function mergeProps(...props: InputProps[]): HTMLProps {
  return mergePropsN(props);
}

export function mergePropsN(props: InputProps[]): HTMLProps {
  if (props.length === 0) {
    return EMPTY_PROPS;
  }

  // We need to mutably own `merged`.
  let merged = createInitialMergedProps(props[0]);

  for (let i = 1; i < props.length; i += 1) {
    merged = mergeInto(merged, props[i]);
  }

  return merged;
}

function createInitialMergedProps(inputProps: InputProps) {
  if (isPropsGetter(inputProps)) {
    // Getter-returned handlers intentionally keep their existing semantics.
    return { ...inputProps(EMPTY_PROPS) };
  }

  return mutablyMergeInto({}, inputProps);
}

function mergeInto(merged: Record<string, any>, inputProps: InputProps) {
  if (isPropsGetter(inputProps)) {
    return inputProps(merged);
  }
  return mutablyMergeInto(merged, inputProps);
}

function mutablyMergeInto(
  mergedProps: Record<string, any>,
  externalProps: Record<string, any> | undefined | null,
) {
  if (!externalProps) {
    return mergedProps;
  }

  // `Object.keys` (not `for...in`) so that Solid's props proxies are enumerated through `ownKeys`.
  const propNames = Object.keys(externalProps);

  for (let i = 0; i < propNames.length; i += 1) {
    const propName = propNames[i];

    // `children` is never read here: reading it creates the child elements. The element renderer
    // forwards it lazily instead (and so does the public `mergeProps` in `./index.ts`).
    if (propName === 'children') {
      continue;
    }

    const externalPropValue = externalProps[propName];

    switch (propName) {
      case 'style': {
        mergedProps[propName] = mergeStyles(mergedProps.style, externalPropValue);
        break;
      }
      case 'class': {
        mergedProps[propName] = mergeClassNames(mergedProps.class, externalPropValue);
        break;
      }
      case 'ref': {
        mergedProps[propName] = mergeRefs(mergedProps.ref, externalPropValue);
        break;
      }
      default: {
        if (isEventHandler(propName, externalPropValue)) {
          mergedProps[propName] = mergeEventHandlers(mergedProps[propName], externalPropValue);
        } else {
          mergedProps[propName] = externalPropValue;
        }
      }
    }
  }

  return mergedProps;
}

function isEventHandler(key: string, value: unknown) {
  // This approach is more efficient than using a regex.
  const code0 = key.charCodeAt(0);
  const code1 = key.charCodeAt(1);
  const code2 = key.charCodeAt(2);
  return (
    code0 === 111 /* o */ &&
    code1 === 110 /* n */ &&
    code2 >= 65 /* A */ &&
    code2 <= 90 /* Z */ &&
    (typeof value === 'function' || typeof value === 'undefined' || Array.isArray(value))
  );
}

function isPropsGetter(inputProps: InputProps): inputProps is (props: HTMLProps) => HTMLProps {
  return typeof inputProps === 'function';
}

type AnyHandler = Function | [Function, unknown] | undefined;

/**
 * Calls an event handler written as a function or as Solid's bound form, `[handler, data]`.
 */
export function callEventHandler(handler: AnyHandler, event: unknown, ...rest: unknown[]) {
  if (typeof handler === 'function') {
    return handler(event, ...rest);
  }
  if (Array.isArray(handler)) {
    return handler[0](handler[1], event, ...rest);
  }
  return undefined;
}

function mergeEventHandlers(ourHandler: AnyHandler, theirHandler: AnyHandler) {
  if (!theirHandler) {
    return ourHandler;
  }
  if (!ourHandler) {
    return wrapEventHandler(theirHandler);
  }

  return (...args: unknown[]) => {
    const event = args[0];

    if (isEvent(event)) {
      const baseUIEvent = event as BaseUIEvent;

      makeEventPreventable(baseUIEvent);

      const result = callEventHandler(theirHandler, ...(args as [unknown]));

      if (!baseUIEvent.baseUIHandlerPrevented) {
        callEventHandler(ourHandler, ...(args as [unknown]));
      }

      return result;
    }

    const result = callEventHandler(theirHandler, ...(args as [unknown]));
    callEventHandler(ourHandler, ...(args as [unknown]));
    return result;
  };
}

function wrapEventHandler(handler: AnyHandler) {
  if (!handler) {
    return handler;
  }

  return (...args: unknown[]) => {
    const event = args[0];

    if (isEvent(event)) {
      makeEventPreventable(event as BaseUIEvent);
    }

    return callEventHandler(handler, ...(args as [unknown]));
  };
}

export function makeEventPreventable<T extends Event>(event: BaseUIEvent<T>) {
  // The same native event object reaches every handler in the chain and ancestors' handlers, like
  // React's bubbling synthetic event, so a prevention also skips the Base UI handlers of ancestors
  // (for example, list navigation on a popup when an input inside opts out of a key).
  event.preventBaseUIHandler = () => {
    (event as { baseUIHandlerPrevented?: boolean }).baseUIHandlerPrevented = true;
  };

  return event;
}

type ClassValue = unknown;

/**
 * Merges two `class` values so that `theirs` comes first.
 * Strings are concatenated; Solid's array and object forms are kept and combined in an array.
 */
export function mergeClassNames(ourClassName: ClassValue, theirClassName: ClassValue): any {
  if (theirClassName) {
    if (ourClassName) {
      if (typeof theirClassName === 'string' && typeof ourClassName === 'string') {
        // eslint-disable-next-line prefer-template
        return theirClassName + ' ' + ourClassName;
      }
      return [theirClassName, ourClassName];
    }

    return theirClassName;
  }

  return ourClassName;
}

type StyleValue = Record<string, any> | string | boolean | undefined | null;

function styleStringToObject(css: string) {
  const style: Record<string, string> = {};
  const declarations = css.split(';');
  for (let i = 0; i < declarations.length; i += 1) {
    const declaration = declarations[i];
    const index = declaration.indexOf(':');
    if (index > 0) {
      style[declaration.slice(0, index).trim()] = declaration.slice(index + 1).trim();
    }
  }
  return style;
}

function toStyleObject(style: StyleValue): Record<string, any> | undefined {
  if (typeof style === 'string') {
    return styleStringToObject(style);
  }
  return style && typeof style === 'object' ? style : undefined;
}

/**
 * Merges two `style` values, with `theirs` overwriting `ours`. String styles are parsed.
 */
export function mergeStyles(ours: StyleValue, theirs: StyleValue): Record<string, any> | undefined {
  const ourStyle = toStyleObject(ours);
  const theirStyle = toStyleObject(theirs);
  if (!theirStyle) {
    return ourStyle;
  }
  if (!ourStyle) {
    return theirStyle;
  }
  return { ...ourStyle, ...theirStyle };
}

type RefValue = ((element: any) => void) | RefValue[] | undefined | null;

/**
 * Combines `ref` callbacks into the array form Solid's `ref` prop accepts.
 */
export function mergeRefs(...refs: RefValue[]): ((element: any) => void)[] {
  const result: ((element: any) => void)[] = [];
  for (let i = 0; i < refs.length; i += 1) {
    const ref = refs[i];
    if (Array.isArray(ref)) {
      result.push(...mergeRefs(...ref));
    } else if (typeof ref === 'function' && !result.includes(ref)) {
      // The same callback can arrive twice (as the component's `ref` and inside its props).
      result.push(ref);
    }
  }
  return result;
}

function isEvent(event: unknown): event is Event {
  return event != null && typeof event === 'object' && 'preventDefault' in event;
}
