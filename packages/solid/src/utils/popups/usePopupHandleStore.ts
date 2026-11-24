import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useIsoLayoutEffect } from '#utils/useEffect';
import type { PopupHandleStoreProvider } from './popupHandle';

/**
 * Reads the store currently exposed by a popup handle and subscribes to store-pointer changes.
 * Detached triggers use this to follow a handle as a root attaches or detaches: while no root is
 * attached, the handle exposes its fallback store; once a root attaches, subscribers re-render and
 * read from the live root store.
 *
 * Returns `undefined` when no handle is provided so callers can fall back to their root context.
 *
 * @param handle The popup handle to read from, or `undefined` when the trigger is not handle-bound.
 */
export function usePopupHandleStore<HandleStore>(
  handle: MaybeAccessor<PopupHandleStoreProvider<HandleStore> | undefined>,
): Accessor<HandleStore | undefined> {
  // Bumped when the handle's store pointer changes, so the memo below reads it again.
  const [version, setVersion] = createSignal(0, { ownedWrite: true });

  useIsoLayoutEffect(
    () => [access(handle)] as const,
    ([currentHandle]) => {
      if (currentHandle === undefined) {
        return undefined;
      }

      const unsubscribe = currentHandle.subscribeStore(() => {
        setVersion((count) => count + 1);
      });
      // Like `useSyncExternalStore`, re-read the snapshot once subscribed, in case the pointer
      // changed between the first read and the subscription.
      setVersion((count) => count + 1);
      return unsubscribe;
    },
  );

  return createMemo(() => {
    version();
    const currentHandle = access(handle);
    return currentHandle === undefined ? undefined : currentHandle.store;
  });
}
