/**
 * If the provided class is a function, it is called with the state as the first argument.
 * Otherwise (a string, or Solid's array and object forms) it is returned as is.
 *
 * @param className
 * @param state
 */
export function resolveClassName<State, ClassValue>(
  className: ClassValue | ((state: State) => string | undefined) | undefined,
  state: State,
): ClassValue | string | undefined {
  return typeof className === 'function'
    ? (className as (state: State) => string | undefined)(state)
    : className;
}
