'use client';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import type { PopoverStore } from '../store/PopoverStore';

/**
 * Settles a controlled `open` prop against the request that may have asked for it.
 *
 * A controlled change reflected back in the request's own synchronous React transaction keeps the
 * interaction's provenance. A prop that stays put declines the request, and everything the request
 * would have committed is discarded rather than left to poison a later change. A prop that moves
 * on its own — including a deferred `startTransition` or an asynchronous store update, which
 * cannot be told apart from a decline without a public acknowledgement mechanism — is programmatic.
 *
 * The ordering here is load-bearing, which is why the reconciliation and the controlled-prop write
 * live in one hook rather than as two adjacent calls: reconciliation has to observe the raw `open`
 * the request left behind before `useControlledProp` overwrites the effective value, and a deferred
 * commit has to land before the effective `open` transition it belongs to is processed. Swapping
 * the two would make a popup the consumer asked to keep mounted unmount immediately.
 */
export function useControlledOpenProvenance<Payload>(
  store: PopoverStore<Payload>,
  openProp: boolean | undefined,
) {
  const rawOpen = store.useState('rawOpen');
  const requestVersion = store.useState('controlledRequestVersion');

  useIsoLayoutEffect(() => {
    store.reconcileControlledOpen(openProp);
    // `rawOpen` and `requestVersion` are dependencies so a request the consumer never reflects
    // still forces this to run: the prop alone does not change when a request is declined.
  }, [store, openProp, rawOpen, requestVersion]);

  store.useControlledProp('openProp', openProp);
}
