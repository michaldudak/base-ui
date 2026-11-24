import { merge, omit } from 'solid-js';
import type { MenuFilterRootProps } from './MenuFilterRoot';

/**
 * Splits a filterable root's props between the menu root and the filter below it.
 *
 * Solid port: the returned prop bags are reactive objects (spread them into JSX), and `children`
 * is an accessor, so nothing is read here.
 */
export function useMenuFilterRoot<Payload>(props: MenuFilterRootProps<Payload>) {
  const otherProps = omit(
    props,
    'children',
    'value',
    'defaultValue',
    'onValueChange',
    'filter',
    'autoHighlight',
    'locale',
  );

  const autoHighlight = () => props.autoHighlight ?? false;

  const virtualFocusRef = { current: null as HTMLElement | null };

  return {
    children: () => props.children,
    rootProps: merge(otherProps, {
      virtualFocus: true,
      virtualFocusRef,
      get allowEscape() {
        return !autoHighlight();
      },
      get resetOnPointerLeave() {
        return autoHighlight() !== 'always';
      },
    }),
    dropdownProps: {
      get value() {
        return props.value;
      },
      get defaultValue() {
        return props.defaultValue;
      },
      get onValueChange() {
        return props.onValueChange;
      },
      get filter() {
        return props.filter;
      },
      get autoHighlight() {
        return autoHighlight();
      },
      get locale() {
        return props.locale;
      },
    },
  };
}
