import { createSignal, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import { error } from './error';
import { useEffect } from './useEffect';

export interface UseControlledProps<T = unknown> {
  /**
   * Reads the component value when it's controlled (usually `() => props.value`).
   */
  controlled: Accessor<T | undefined>;
  /**
   * Reads the default value when uncontrolled (usually `() => props.defaultValue`).
   */
  default: Accessor<T | undefined>;
  /**
   * The component name displayed in warnings.
   */
  name: string;
  /**
   * The name of the state variable displayed in warnings.
   */
  state?: string | undefined;
}

/**
 * The Solid counterpart of `useControlled`.
 * Returns an accessor for the value and a setter for the uncontrolled value.
 *
 * Like all signals, the accessor keeps returning the previous value until the next flush.
 */
export function useControlled<T = unknown>(
  props: Omit<UseControlledProps<T>, 'default'> & { default: Accessor<T> },
): [Accessor<T>, (value: T | ((prev: T) => T)) => void];
export function useControlled<T = unknown>(
  props: UseControlledProps<T>,
): [Accessor<T | undefined>, (value: T | undefined | ((prev: T | undefined) => T | undefined)) => void];
export function useControlled<T = unknown>(
  props: UseControlledProps<T>,
): [Accessor<T | undefined>, (value: any) => void] {
  const { name, state = 'value' } = props;
  const isControlled = untrack(props.controlled) !== undefined;
  const defaultValue = untrack(props.default);
  const [valueState, setValueState] = createSignal(defaultValue as any, {
    ownedWrite: true,
  }) as unknown as [Accessor<T | undefined>, (value: any) => void];

  const value = () => {
    const controlled = props.controlled();
    return isControlled && controlled !== undefined ? controlled : valueState();
  };

  if (process.env.NODE_ENV !== 'production') {
    useEffect(
      () => [props.controlled()],
      ([controlled]) => {
        if (isControlled !== (controlled !== undefined)) {
          error(
            [
              `A component is changing the ${
                isControlled ? '' : 'un'
              }controlled ${state} state of ${name} to be ${isControlled ? 'un' : ''}controlled.`,
              'Elements should not switch from uncontrolled to controlled (or vice versa).',
              `Decide between using a controlled or uncontrolled ${name} ` +
                'element for the lifetime of the component.',
              "The nature of the state is determined when the component is created. It's considered controlled if the value is not `undefined`.",
            ].join('\n'),
          );
        }
      },
    );
  }

  const setValue = (newValue: any) => {
    if (!isControlled) {
      // A function value is a state updater, like in React.
      setValueState(typeof newValue === 'function' ? newValue : () => newValue);
    }
  };

  return [value, setValue];
}
