/**
 * Memoizes a function, keeping only the result of the most recent call.
 * Arguments are compared by reference.
 */
export function lruMemoize<F extends (...args: any[]) => any>(fn: F): F {
  let lastArgs: any[] | undefined;
  let lastResult: any;
  return ((...args: any[]) => {
    if (
      lastArgs !== undefined &&
      lastArgs.length === args.length &&
      lastArgs.every((arg, index) => Object.is(arg, args[index]))
    ) {
      return lastResult;
    }
    lastArgs = args;
    lastResult = fn(...args);
    return lastResult;
  }) as F;
}
