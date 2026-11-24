/**
 * If the provided style is an object or a string, it will be returned as is.
 * Otherwise, the function will call the style function with the state as the first argument.
 *
 * @param style
 * @param state
 */
export function resolveStyle<State, Style>(
  style: Style | ((state: State) => Style | undefined) | undefined,
  state: State,
): Style | undefined {
  return typeof style === 'function'
    ? (style as (state: State) => Style | undefined)(state)
    : style;
}
