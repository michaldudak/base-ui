import { createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { SolidStore } from '#utils/store';
import { EMPTY_OBJECT } from '#utils/empty';
import type { InteractionType } from '#utils/useEnhancedClickHandler';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useExternalEffect } from '#utils/useEffect';
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

/**
 * Publishes the store's trigger registry to its state, which is what the active trigger is
 * derived from.
 */
function commitTriggers(store: PopupTriggerDataStore<PopupStoreState<unknown>>) {
  store.set('triggers', store.context.triggerElements.snapshot());
}

interface TriggerRegistration<State extends PopupStoreState<unknown>> {
  store: PopupTriggerDataStore<State>;
  id: string;
  element: Element;
}

/**
 * Registers/unregisters `element` in the registry of `store` under `id`, given the previous
 * registration. With `commit`, the stores whose registry changed publish it to their state.
 */
function updateTriggerRegistration<State extends PopupStoreState<unknown>>(
  registrationRef: { current: TriggerRegistration<State> | null },
  element: Element | null,
  store: PopupTriggerDataStore<State>,
  id: string | undefined,
  commit: boolean,
  data?: (() => object) | undefined,
) {
  const registration = registrationRef.current;

  if (
    registration !== null &&
    (registration.element !== element || registration.store !== store || registration.id !== id)
  ) {
    registrationRef.current = null;
    const registeredStore = registration.store;
    if (registeredStore.context.triggerElements.getById(registration.id) === registration.element) {
      const wasActive =
        registeredStore.select('open') &&
        registeredStore.select('activeTriggerId') === registration.id;
      registeredStore.context.triggerElements.delete(registration.id);
      registeredStore.context.triggerData.delete(registration.id);
      if (commit && registeredStore !== store) {
        commitTriggers(registeredStore);
      }
      if (wasActive) {
        registeredStore.context.onActiveTriggerUnregistered?.(registration.id);
      }
    }
  }

  if (registrationRef.current === null && element !== null && id !== undefined) {
    registrationRef.current = { store, id, element };
    store.context.triggerElements.add(id, element);
    if (data) {
      store.context.triggerData.set(id, data);
    }
  }

  if (commit) {
    commitTriggers(store);
  }
}

/**
 * Registers the trigger element in the store under `id`, and returns the ref callback to put on
 * the trigger element.
 *
 * Registration has two halves. The ref callback adds the element to the store's registry as soon
 * as the element is created, so a handle can find the trigger by id before any effect runs. An
 * effect then publishes the registry to the store's state, where the active trigger is derived
 * from it; it also moves the registration when the store or the id changes, and removes it when
 * the trigger is disposed.
 *
 * @param id Id of the trigger.
 * @param store The Store instance where the trigger should be registered.
 * @param data What the trigger forwards to the popup while the popup belongs to it.
 */
export function useTriggerRegistration<State extends PopupStoreState<unknown>>(
  id: MaybeAccessor<string | undefined>,
  store: MaybeAccessor<PopupTriggerDataStore<State>>,
  data?: Accessor<object>,
) {
  const registrationRef: { current: TriggerRegistration<State> | null } = { current: null };

  // The values the ref callback uses. It runs while the trigger is created, before any effect, so
  // it starts with the initial values (read once on purpose); the effect keeps them current.
  const latest = {
    store: untrack(() => access(store)),
    id: untrack(() => access(id)),
  };

  // A signal, so that the effect runs again when the trigger renders another element.
  const [element, setElement] = createSignal<Element | null>(null, { ownedWrite: true });

  const registerTrigger = (triggerElement: Element | null) => {
    updateTriggerRegistration(
      registrationRef,
      triggerElement,
      latest.store,
      latest.id,
      false,
      data,
    );
    setElement(triggerElement);
  };

  useExternalEffect(
    () => [access(store), access(id), element()] as const,
    ([currentStore, currentId, currentElement]) => {
      latest.store = currentStore;
      latest.id = currentId;
      updateTriggerRegistration(
        registrationRef,
        currentElement,
        currentStore,
        currentId,
        true,
        data,
      );
      return () => {
        updateTriggerRegistration(registrationRef, null, currentStore, currentId, true);
      };
    },
  );

  return registerTrigger;
}

/**
 * Registers the trigger together with the data it forwards to the popup while the popup belongs
 * to it (its payload, for example).
 *
 * Nothing is copied into the store from here. The Root derives the store's values from the active
 * trigger's data (see `useActiveTriggerData`), so they change in the same pass as the active
 * trigger does.
 *
 * @param triggerId Id of the trigger.
 * @param store The Store instance managing the popup state.
 * @param triggerData The data of this trigger.
 */
export function useTriggerDataForwarding<
  State extends PopupStoreState<unknown>,
  const Key extends keyof Omit<State, 'activeTriggerId' | 'activeTriggerElement'>,
>(
  triggerId: MaybeAccessor<string | undefined>,
  store: MaybeAccessor<PopupTriggerDataStore<State>>,
  triggerData: Accessor<Pick<State, Key>>,
) {
  // The store can change (a handle switching between its fallback store and a root's store), so
  // the selector is re-created for the current store.
  const isMountedByThisTrigger = createMemo(() =>
    access(store).useState('isMountedByTrigger', triggerId)(),
  );

  // Compared by value, like the spread `Object.values(stateUpdates)` dependencies in React.
  const data = createMemo(triggerData, { equals: shallowEqual });

  const registerTrigger = useTriggerRegistration(triggerId, store, data);

  return { registerTrigger, isMountedByThisTrigger };
}

export function shallowEqual(a: object | undefined, b: object | undefined) {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
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
