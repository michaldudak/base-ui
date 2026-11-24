import { createMemo, createSignal, untrack } from 'solid-js';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useEffect, useIsoLayoutEffect } from '#utils/useEffect';
import { useTransitionStatus } from './useTransitionStatus';
import { useOpenChangeComplete } from './useOpenChangeComplete';

export interface UseUnmountAfterCloseParameters {
  /**
   * Whether the popup is open.
   */
  open: MaybeAccessor<boolean>;
  /**
   * Ref to the element whose closing animations are awaited before unmounting.
   */
  ref: { current: HTMLElement | null };
  /**
   * Whether the current close cycle asked to keep the popup mounted until the `unmount` action
   * is called. Ignored while `open`.
   */
  preventUnmountOnClose: MaybeAccessor<boolean>;
  /**
   * Writes `preventUnmountOnClose`. Opening starts a new close cycle, so the hook clears it
   * whenever `open` becomes `true`.
   */
  setPreventUnmountOnClose: (preventUnmountOnClose: boolean) => void;
  /**
   * Subscribes to updates that can attach the element behind `ref`, and returns the unsubscribe
   * function. A popup that closes before its element attaches waits for it, then for its closing
   * animations.
   */
  subscribeToAttach?: ((listener: () => void) => () => void) | undefined;
  /**
   * Runs once per unmount, whether it completed automatically or through `forceUnmount`.
   */
  onUnmount: () => void;
  /**
   * Whether a popup that mounts already open should still play its enter transition.
   * See `useTransitionStatus`.
   */
  animateInitialOpen?: MaybeAccessor<boolean | undefined>;
}

/**
 * Keeps a popup mounted through its closing animation and unmounts it once the animation
 * finishes, unless the close cycle opted out through `preventUnmountOnClose`.
 * Store-agnostic: hosts sync `mounted` and `transitionStatus` wherever they need them.
 *
 * @returns `forceUnmount` unmounts the popup immediately. It is a no-op once the popup is already
 *   unmounted, so calling it after the automatic unmount doesn't repeat the completion callback,
 *   and a call while the popup is open only takes effect if a close commits in the same batch.
 */
export function useUnmountAfterClose(parameters: UseUnmountAfterCloseParameters) {
  const open = () => access(parameters.open);

  const { mounted, setMounted, transitionStatus } = useTransitionStatus(
    open,
    false,
    false,
    () => access(parameters.animateInitialOpen) ?? false,
  );

  // Opening starts a new close cycle. Derive it so the close-completion hook below reads the
  // value on the same pass, and clear the stored value so it doesn't leak into the next
  // close. The effect only runs when `open` changes, so an opt-out recorded while a controlled
  // close is still pending (for example in a transition) is not cleared by the render that still
  // sees `open`.
  const preventUnmountingOnClose = createMemo(() =>
    open() ? false : access(parameters.preventUnmountOnClose),
  );
  useIsoLayoutEffect(
    () => [open()] as const,
    ([isOpen]) => {
      if (isOpen) {
        parameters.setPreventUnmountOnClose(false);
      }
    },
  );

  // Mirrors `mounted` synchronously so repeated `forceUnmount()` calls in one batch complete
  // closing once. Resynced after every change, including every `unmount()`: `setMounted(false)`
  // while open re-mounts without changing `mounted`, so a `[mounted]` dependency alone would leave
  // the mirror stale and block every later unmount.
  // Initial value, read once on purpose.
  const mountedRef = { current: untrack(mounted) };
  // The `open` value the effect below last saw. `forceUnmount` and the completion callback can run
  // inside an effect, where reading the `open` accessor isn't allowed, so they read this mirror,
  // which matches the `open` React rendered last.
  const openRef = { current: untrack(open) };
  // A `forceUnmount()` call while open is decided once its request has been applied. Other
  // updates in the same batch can apply first, before the batch's own state (a controlled `open`
  // prop) has landed.
  const [unmountRequest, setUnmountRequest] = createSignal(0, { ownedWrite: true });
  const unmountRequestRef = { current: 0 };
  const pendingUnmountRef: { current: number | null } = { current: null };
  // Bumped by every `unmount()`, so the effect below resyncs `mountedRef` afterwards.
  const [unmountCount, setUnmountCount] = createSignal(0, { ownedWrite: true });

  const unmount = () => {
    mountedRef.current = false;
    setMounted(false);
    setUnmountCount((count) => count + 1);
    parameters.onUnmount();
  };

  useIsoLayoutEffect(
    () => [mounted(), unmountRequest(), open(), unmountCount()] as const,
    ([isMounted, request, isOpen]) => {
      mountedRef.current = isMounted;
      openRef.current = isOpen;
      if (pendingUnmountRef.current !== null && pendingUnmountRef.current <= request) {
        pendingUnmountRef.current = null;
        if (!isOpen && isMounted) {
          unmount();
        }
      }
    },
  );

  const forceUnmount = () => {
    if (!mountedRef.current) {
      return;
    }
    if (openRef.current) {
      // The rendered `open` can't tell a stale exit-animation callback after a quick reopen from a
      // close batched with this call (`close(); unmount()`). Decide once the batch commits: unmount
      // if the popup closed, otherwise drop the call rather than run the host's unmount cleanup and
      // the close completion against a live popup.
      unmountRequestRef.current += 1;
      pendingUnmountRef.current = unmountRequestRef.current;
      setUnmountRequest(unmountRequestRef.current);
      return;
    }
    unmount();
  };

  const waitsForClose = createMemo(() => mounted() && !open() && !preventUnmountingOnClose());

  // The portal renders the popup a few commits after it mounts. A close within that window starts
  // waiting before the element exists, so the wait restarts once it attaches.
  const [attachCount, setAttachCount] = createSignal(0, { ownedWrite: true });
  useEffect(
    () => [waitsForClose()] as const,
    ([waits]) => {
      if (!waits || parameters.ref.current != null || !parameters.subscribeToAttach) {
        return undefined;
      }
      const unsubscribe = parameters.subscribeToAttach(() => {
        if (parameters.ref.current != null) {
          unsubscribe();
          setAttachCount((count) => count + 1);
        }
      });
      return unsubscribe;
    },
  );

  useOpenChangeComplete({
    enabled: waitsForClose,
    open,
    ref: parameters.ref,
    restartKey: attachCount,
    onComplete() {
      if (!openRef.current) {
        forceUnmount();
      }
    },
  });

  return { mounted, transitionStatus, preventUnmountingOnClose, forceUnmount };
}
