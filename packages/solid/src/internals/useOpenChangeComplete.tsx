import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useEffect } from '#utils/useEffect';
import { useAnimationsFinished } from './useAnimationsFinished';

/**
 * Calls the provided function when the CSS open/close animation or transition completes.
 */
export function useOpenChangeComplete(parameters: UseOpenChangeCompleteParameters) {
  // The `open` value of the latest run of the effect below, which the wait reads when it starts.
  let currentOpen: boolean | undefined;

  const onComplete = () => parameters.onComplete();
  const runOnceAnimationsFinish = useAnimationsFinished(
    parameters.ref,
    () => currentOpen ?? false,
    parameters.batch ?? false,
  );

  useEffect(
    () =>
      [
        access(parameters.enabled) ?? true,
        access(parameters.open),
        access(parameters.restartKey),
      ] as const,
    ([enabled, open]) => {
      currentOpen = open;

      if (!enabled) {
        return undefined;
      }

      const abortController = new AbortController();

      runOnceAnimationsFinish(onComplete, abortController.signal);

      return () => {
        abortController.abort();
      };
    },
  );
}

export interface UseOpenChangeCompleteParameters {
  /**
   * Whether the hook is enabled.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether the element is open.
   */
  open?: MaybeAccessor<boolean | undefined>;
  /**
   * Ref to the element being closed.
   */
  ref: { current: HTMLElement | null };
  /**
   * Whether completions ready in the same microtask may be coalesced into a single commit.
   * Only safe when `onComplete` doesn't read state that another completion can change.
   * @default false
   */
  batch?: boolean | undefined;
  /**
   * Restarts the wait when it changes, such as when the element attaches after the wait started.
   */
  restartKey?: MaybeAccessor<unknown>;
  /**
   * Function to call when the animation completes (or there is no animation).
   */
  onComplete: () => void;
}

export interface UseOpenChangeCompleteState {}
