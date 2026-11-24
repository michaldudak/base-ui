import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { AnimationFrame } from '#utils/useAnimationFrame';

export type TransitionStatus = 'starting' | 'ending' | 'idle' | undefined;

interface TransitionState {
  mounted: boolean;
  transitionStatus: TransitionStatus;
}

/**
 * Provides a status string for CSS animations.
 * @param open - a boolean that determines if the element is open.
 * @param enableIdleState - a boolean that enables the `'idle'` state between `'starting'` and `'ending'`
 * @param deferEndingState - a boolean that delays the `'ending'` state by a frame
 * @param animateInitialOpen - a boolean that makes an element which mounts already open still go
 *   through `'starting'`. Off by default so content that was open on the first render (a
 *   `defaultOpen` popup on page load, SSR'd markup) doesn't animate in.
 */
export function useTransitionStatus(
  open: MaybeAccessor<boolean>,
  enableIdleState: MaybeAccessor<boolean> = false,
  deferEndingState: MaybeAccessor<boolean> = false,
  animateInitialOpen: MaybeAccessor<boolean> = false,
) {
  // The values the adjustments below last saw, so the setters can apply them as well.
  let currentOpen = false;
  let currentDeferEndingState = false;

  // React adjusts `mounted` and `transitionStatus` while rendering, so the element sees the
  // adjusted values in the same pass. Here they are a writable derivation: it re-runs the
  // adjustments whenever `open` changes, starting from the last written values, and the setters
  // apply them to every write.
  const [state, setState] = createSignal<TransitionState>(
    (prev) => {
      currentOpen = access(open);
      currentDeferEndingState = access(deferEndingState);
      return adjust(
        prev ?? {
          transitionStatus: currentOpen && access(enableIdleState) ? 'idle' : undefined,
          // Starting at `false` while open lets the `open && !mounted` branch below run on the
          // first render, which is what produces the `'starting'` phase.
          mounted: currentOpen && !access(animateInitialOpen),
        },
      );
    },
    { ownedWrite: true },
  );

  function adjust(previous: TransitionState): TransitionState {
    let { mounted, transitionStatus } = previous;

    if (currentOpen && !mounted) {
      mounted = true;
      transitionStatus = 'starting';
    }

    if (!currentOpen && mounted && transitionStatus !== 'ending' && !currentDeferEndingState) {
      transitionStatus = 'ending';
    }

    if (!currentOpen && !mounted && transitionStatus === 'ending') {
      transitionStatus = undefined;
    }

    if (mounted === previous.mounted && transitionStatus === previous.transitionStatus) {
      return previous;
    }
    return { mounted, transitionStatus };
  }

  const setTransitionStatus = (transitionStatus: TransitionStatus) => {
    setState((prev) =>
      prev.transitionStatus === transitionStatus ? prev : adjust({ ...prev, transitionStatus }),
    );
  };

  const setMounted = (mounted: boolean) => {
    setState((prev) => (prev.mounted === mounted ? prev : adjust({ ...prev, mounted })));
  };

  const mounted: Accessor<boolean> = createMemo(() => state().mounted);
  const transitionStatus: Accessor<TransitionStatus> = createMemo(() => state().transitionStatus);

  useIsoLayoutEffect(
    () => [access(open), mounted(), transitionStatus(), access(deferEndingState)] as const,
    ([isOpen, isMounted, status, deferEnding]) => {
      if (!isOpen && isMounted && status !== 'ending' && deferEnding) {
        const frame = AnimationFrame.request(() => {
          setTransitionStatus('ending');
        });

        return () => {
          AnimationFrame.cancel(frame);
        };
      }

      return undefined;
    },
  );

  useIsoLayoutEffect(
    () => [access(enableIdleState), access(open), transitionStatus()] as const,
    ([enableIdle, isOpen, status]) => {
      // Nothing to clear when the element mounted open or reopened after its exit settled.
      if (!isOpen || enableIdle || status === undefined) {
        return undefined;
      }

      const frame = AnimationFrame.request(() => {
        // Avoid `flushSync` here due to Firefox.
        // See https://github.com/mui/base-ui/pull/3424
        setTransitionStatus(undefined);
      });

      return () => {
        AnimationFrame.cancel(frame);
      };
    },
  );

  useIsoLayoutEffect(
    () => [access(enableIdleState), access(open), mounted(), transitionStatus()] as const,
    ([enableIdle, isOpen, isMounted, status]) => {
      if (!isOpen || !enableIdle) {
        return undefined;
      }

      if (isOpen && isMounted && status !== 'idle') {
        setTransitionStatus('starting');
      }

      const frame = AnimationFrame.request(() => {
        setTransitionStatus('idle');
      });

      return () => {
        AnimationFrame.cancel(frame);
      };
    },
  );

  return {
    mounted,
    setMounted,
    transitionStatus,
  };
}
