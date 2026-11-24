import { createMemo, onCleanup, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { SolidStore } from '#utils/store';
import { EMPTY_OBJECT } from '#utils/empty';
import type { InteractionType } from '#utils/useEnhancedClickHandler';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { FOCUSABLE_ATTRIBUTE } from './constants';
import type { HTMLProps } from '../../internals/types';
import type {
  PopupStoreState,
  PopupStoreContext,
  popupStoreSelectors,
  PopupTriggerDataStore,
} from './store';

export const FOCUSABLE_POPUP_PROPS = {
  tabindex: -1,
  [FOCUSABLE_ATTRIBUTE]: '',
} satisfies HTMLProps<HTMLElement> & Record<typeof FOCUSABLE_ATTRIBUTE, string>;

/**
 * Returns the default `initialFocus` resolver for a popup. When opened by touch it focuses the
 * popup element itself to prevent the virtual keyboard from opening (required for Android
 * specifically; iOS handles this automatically). Otherwise it falls back to the default behavior.
 */
export function createDefaultInitialFocus(popupRef: { current: HTMLElement | null }) {
  return (interactionType: InteractionType) =>
    interactionType === 'touch' ? popupRef.current : true;
}

function syncTriggerCount(store: PopupTriggerDataStore<PopupStoreState<unknown>>) {
  const triggerCount = store.context.triggerElements.size;
  if (store.select('open') && store.state.triggerCount !== triggerCount) {
    store.set('triggerCount', triggerCount);
  }
}

interface TriggerRegistration<State extends PopupStoreState<unknown>> {
  store: PopupTriggerDataStore<State>;
  id: string;
  element: Element;
}

/**
 * Registers/unregisters `element` in `store` under `id`, given the previous registration.
 * Returns the new registration.
 */
function updateTriggerRegistration<State extends PopupStoreState<unknown>>(
  registrationRef: { current: TriggerRegistration<State> | null },
  element: Element | null,
  store: PopupTriggerDataStore<State>,
  id: string | undefined,
) {
  const registration = registrationRef.current;

  if (registration !== null) {
    if (
      registration.element === element &&
      registration.store === store &&
      registration.id === id
    ) {
      // Already registered where it belongs, so the caller's migration effect is free on mount.
      return;
    }

    registrationRef.current = null;
    const registeredStore = registration.store;
    if (registeredStore.context.triggerElements.getById(registration.id) === registration.element) {
      registeredStore.context.triggerElements.delete(registration.id);
      syncTriggerCount(registeredStore);
    }
  }

  if (element !== null && id !== undefined) {
    registrationRef.current = { store, id, element };
    store.context.triggerElements.add(id, element);
    syncTriggerCount(store);
  }
}

/**
 * Returns a stable callback ref that registers/unregisters the trigger element in the store.
 *
 * Stable so a downstream ref merger that retains the callback it was first given still reaches the
 * trigger's current store. The registration is tracked as a `(store, id, element)` triple, so
 * unregistering targets the store the element was actually registered in.
 *
 * Since the callback never changes, the caller must re-run it from a layout effect keyed on
 * `[store, id]` to migrate an already-registered element. That effect is also what registers the
 * element in the first place when `id` only resolves after the first commit (React 17's `useId`
 * fallback), because the register call made while the id is still `undefined` does nothing.
 *
 * @param id Id of the trigger.
 * @param store The Store instance where the trigger should be registered.
 */
export function useTriggerRegistration<State extends PopupStoreState<unknown>>(
  id: MaybeAccessor<string | undefined>,
  store: MaybeAccessor<PopupTriggerDataStore<State>>,
) {
  const registrationRef: { current: TriggerRegistration<State> | null } = { current: null };

  return (element: Element | null) => {
    updateTriggerRegistration(registrationRef, element, access(store), access(id));
  };
}

/**
 * Sets up trigger data forwarding to the store.
 *
 * @param triggerId Id of the trigger.
 * @param triggerElementRef Ref for the trigger DOM element.
 * @param store The Store instance managing the popup state.
 * @param stateUpdates An object with state updates to apply when the trigger is active.
 */
export function useTriggerDataForwarding<
  State extends PopupStoreState<unknown>,
  const Key extends keyof Omit<State, 'activeTriggerId' | 'activeTriggerElement'>,
>(
  triggerId: MaybeAccessor<string | undefined>,
  triggerElementRef: { current: Element | null },
  store: MaybeAccessor<PopupTriggerDataStore<State>>,
  stateUpdates: Accessor<Pick<State, Key>>,
) {
  // The store can change (a handle switching between its fallback store and a root's store), so
  // the selector is re-created for the current store.
  const isMountedByThisTrigger = createMemo(() =>
    access(store).useState('isMountedByTrigger', triggerId)(),
  );

  // Compared by value, like the spread `Object.values(stateUpdates)` dependencies in React.
  const stateUpdatesValue = createMemo(stateUpdates, { equals: shallowEqual });

  // The values the ref callback and the effects below last saw. The ref callback runs while the
  // trigger is created, before any effect, so it starts with the initial values (read once on
  // purpose); the effects keep them current.
  const latest = {
    store: untrack(() => access(store)),
    triggerId: untrack(() => access(triggerId)),
    stateUpdates: untrack(stateUpdatesValue),
  };

  const registrationRef: { current: TriggerRegistration<State> | null } = { current: null };

  // Applies trigger-owned state (active-trigger ownership and payload) when the trigger registers.
  // Stable so payload/`stateUpdates` changes do not change the ref identity (which would needlessly
  // churn registration); it reads the latest closure values when invoked.
  const applyTriggerData = (element: Element) => {
    const currentStore = latest.store;
    const currentTriggerId = latest.triggerId;
    const open = currentStore.select('open');
    const activeTriggerId = currentStore.select('activeTriggerId');

    if (activeTriggerId === currentTriggerId) {
      const changes = {
        activeTriggerElement: element,
        ...(open ? latest.stateUpdates : null),
      } as Pick<Readonly<State>, Key | 'activeTriggerElement'>;
      currentStore.update(changes);
      return;
    }

    if (activeTriggerId == null && open && !currentStore.state.openedWithoutTrigger) {
      // If a popup is already open, a detached trigger can mount before any active trigger
      // has been established. Claim the first registered trigger so trigger-owned focus
      // management and ARIA relationships work. A popup opened deliberately without a trigger
      // stays unassociated so the trigger's `payload` does not replace the programmatic one.
      const changes = {
        activeTriggerId: currentTriggerId ?? null,
        activeTriggerElement: element,
        ...latest.stateUpdates,
      } as Pick<Readonly<State>, Key | 'activeTriggerId' | 'activeTriggerElement'>;
      currentStore.update(changes);
    }
  };

  // Stable, so the merged ref on the rendered element keeps its identity for the trigger's whole
  // lifetime.
  const registerTrigger = (element: Element | null) => {
    updateTriggerRegistration(registrationRef, element, latest.store, latest.triggerId);
    if (element) {
      applyTriggerData(element);
    }
  };

  useIsoLayoutEffect(
    () => [stateUpdatesValue()] as const,
    ([updates]) => {
      latest.stateUpdates = updates;
    },
  );

  // A stable ref does not re-fire on a store or id change, so migrate here instead: unregister from
  // the previous store, then register the element the trigger still renders into the current one.
  useIsoLayoutEffect(
    () => [access(store), access(triggerId)] as const,
    ([currentStore, currentTriggerId]) => {
      latest.store = currentStore;
      latest.triggerId = currentTriggerId;
      registerTrigger(triggerElementRef.current);
      return () => registerTrigger(null);
    },
  );

  useIsoLayoutEffect(
    () => [isMountedByThisTrigger(), access(store), stateUpdatesValue()] as const,
    ([isMounted, currentStore, updates]) => {
      if (isMounted) {
        const changes = {
          activeTriggerElement: triggerElementRef.current,
          ...updates,
        } as Pick<Readonly<State>, Key | 'activeTriggerElement'>;
        currentStore.update(changes);
      }
    },
  );

  return { registerTrigger, isMountedByThisTrigger };
}

function shallowEqual(a: object, b: object) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i];
    if (key !== bKeys[i] || !Object.is(a[key as keyof typeof a], b[key as keyof typeof b])) {
      return false;
    }
  }
  return true;
}

type PopupInteractionPropKey = 'activeTriggerProps' | 'inactiveTriggerProps' | 'popupProps';

export function usePopupInteractionProps<
  State extends PopupStoreState<unknown>,
  const Key extends keyof State,
>(
  store: SolidStore<State, PopupStoreContext<never>, typeof popupStoreSelectors>,
  statePart: Accessor<Pick<State, Key | PopupInteractionPropKey>>,
) {
  store.useSyncedValues(statePart);

  onCleanup(() => {
    store.update({
      activeTriggerProps: EMPTY_OBJECT,
      inactiveTriggerProps: EMPTY_OBJECT,
      popupProps: EMPTY_OBJECT,
    });
  });
}
