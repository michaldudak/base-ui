import { createMemo, onCleanup, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { SolidStore } from '#utils/store';
import type { InteractionType } from '#utils/useEnhancedClickHandler';
import { useId } from '#utils/useId';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useFloatingParentNodeId } from './tree/FloatingTree';
import { useUnmountAfterClose } from '../../internals/useUnmountAfterClose';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { shallowEqual } from './popupStoreUtils';
import type {
  PopupStoreState,
  PopupStoreContext,
  PopupStoreSelectors,
  popupStoreSelectors,
  PopupTriggerDataStore,
} from './store';

/**
 * The props every popup Root shares.
 */
export interface PopupRootProps<Store extends PopupRootStore> {
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: Store['context']['onOpenChange'] | undefined;
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  actionsRef?: { current: PopupRootActions | null } | undefined;
  triggerId?: string | null | undefined;
  defaultTriggerId?: string | null | undefined;
}

export interface PopupRootActions {
  unmount: () => void;
  close: () => void;
}

/**
 * The store state a popup Root derives from its props when it creates the store.
 */
export type PopupRootInitialState = Pick<
  PopupStoreState<unknown>,
  'open' | 'openProp' | 'activeTriggerId' | 'triggerIdProp'
>;

export interface UsePopupRootOptions {
  /**
   * Whether the popup closes when its active trigger unmounts.
   * @default false
   */
  closeOnActiveTriggerUnmount?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether a popup that mounts already open still plays its enter transition.
   * See `useOpenStateTransitions`.
   * @default false
   */
  animateInitialOpen?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether the popup renders as closed. Its open state in the store is left as it is.
   * @default false
   */
  disabled?: MaybeAccessor<boolean | undefined>;
}

/**
 * `UsePopupRootOptions` plus the handle the Root's store attaches to.
 */
export interface UsePopupRootWithHandleOptions<Store> extends UsePopupRootOptions {
  /**
   * The handle to attach the Root's store to while the Root is mounted.
   */
  handle?: MaybeAccessor<PopupRootStoreHandle<Store> | undefined>;
}

/**
 * The popup store members a popup Root relies on.
 */
type PopupRootStore = SolidStore<
  PopupStoreState<unknown>,
  PopupStoreContext<never>,
  PopupStoreSelectors
> & {
  setOpen(
    open: boolean,
    eventDetails: BaseUIChangeEventDetails<typeof REASONS.imperativeAction | typeof REASONS.none>,
  ): void;
  resetOnUnmount(): void;
};

/**
 * Runs what every popup Root does for its popup, in the order it needs: it creates the store,
 * syncs the controlled props and callbacks, keeps the active trigger current, runs the open and
 * close transitions, and exposes the `actionsRef` actions.
 *
 * @param props The props every popup Root shares (the Root's reactive props object; read lazily).
 * @param createStore Builds the store exactly once, from the state the props describe and the
 *   default popup id. The store belongs to the Root, not to its handle: the handle attaches to it,
 *   so swapping the handle re-attaches rather than recreating state. The props only seed it;
 *   controlled props are synced after creation.
 * @param options What differs between popup Roots.
 * @returns The store, and accessors for the open and mounted state, payload and transition status
 *   it renders.
 */
export function usePopupRoot<Store extends PopupRootStore>(
  props: PopupRootProps<Store>,
  createStore: (initialState: PopupRootInitialState, defaultPopupId: string | undefined) => Store,
  options: UsePopupRootWithHandleOptions<Store> = {},
) {
  const defaultPopupId = useId();
  return usePopupRootWithPopupId(props, createStore, defaultPopupId, options);
}

/**
 * `usePopupRoot` for a Root that supplies its own default popup id instead of a generated one.
 *
 * @param defaultPopupId The default popup id, or `undefined` to leave the popup without one.
 */
export function usePopupRootWithPopupId<Store extends PopupRootStore>(
  props: PopupRootProps<Store>,
  createStore: (initialState: PopupRootInitialState, defaultPopupId: string | undefined) => Store,
  defaultPopupId: MaybeAccessor<string | undefined>,
  options: UsePopupRootWithHandleOptions<Store> = {},
) {
  const disabled = () => access(options.disabled) ?? false;

  const store = usePopupRootStore(
    (initialPopupId) =>
      createStore(
        {
          open: props.defaultOpen ?? false,
          openProp: props.open,
          activeTriggerId: props.defaultTriggerId ?? null,
          triggerIdProp: props.triggerId,
        },
        initialPopupId,
      ),
    defaultPopupId,
    () => access(options.handle),
  );

  const transitionOpen = usePopupRootOpenState(store, props, disabled);
  store.useControlledProp('triggerIdProp', () => props.triggerId);
  // Root logic reads the open state from the store, in step with the active trigger and the other
  // values it syncs there. Only the transitions read the controlled prop as soon as it changes.
  const openState = store.useState('open');
  const open = createMemo(() => !disabled() && openState());
  const mounted = store.useState('mounted');
  const payload = store.useState('payload') as Accessor<Store['state']['payload']>;

  useCloseOnActiveTriggerUnmount(store, {
    closeOnActiveTriggerUnmount: () => access(options.closeOnActiveTriggerUnmount) ?? false,
  });
  const transitionStatus = usePopupRootTransitions(
    store,
    transitionOpen,
    props,
    () => access(options.animateInitialOpen) ?? false,
  );

  return { store, open, mounted, payload, transitionStatus };
}

/**
 * `usePopupRoot` for a popup that has a single anchor and no triggers to track, such as a Select
 * or a Combobox: it leaves out the trigger props and the active trigger.
 *
 * @param popupRef The element whose closing animations are awaited before the popup unmounts.
 *   Defaults to the store's `popupRef`.
 */
export function useSingleAnchorPopupRoot<Store extends PopupRootStore>(
  props: Omit<PopupRootProps<Store>, 'triggerId' | 'defaultTriggerId'>,
  createStore: (initialState: PopupRootInitialState, defaultPopupId: string | undefined) => Store,
  popupRef?: { current: HTMLElement | null },
) {
  const store = usePopupRootStore(
    (initialPopupId) =>
      createStore(
        {
          open: props.defaultOpen ?? false,
          openProp: props.open,
          activeTriggerId: null,
          triggerIdProp: undefined,
        },
        initialPopupId,
      ),
    useId(),
    undefined,
  );

  const open = usePopupRootOpenState(store, props, () => false);
  const transitionStatus = usePopupRootTransitions(store, open, props, false, popupRef);

  return { store, open, transitionStatus };
}

/**
 * Syncs the controlled `open` prop and the open change callbacks, and returns whether the popup
 * renders as open.
 */
function usePopupRootOpenState<Store extends PopupRootStore>(
  store: Store,
  props: Pick<PopupRootProps<Store>, 'open' | 'onOpenChange' | 'onOpenChangeComplete'>,
  disabled: Accessor<boolean>,
): Accessor<boolean> {
  store.useControlledProp('openProp', () => props.open);

  store.useContextCallback('onOpenChange', () => props.onOpenChange);
  store.useContextCallback('onOpenChangeComplete', () => props.onOpenChangeComplete);

  const openState = store.useState('open');
  // The store receives a controlled `open` prop in an effect, after the Root is created with it,
  // so the transitions read the prop itself.
  return createMemo(() => !disabled() && (props.open ?? openState()));
}

/**
 * Runs the open and close transitions and exposes the `actionsRef` actions.
 */
function usePopupRootTransitions<Store extends PopupRootStore>(
  store: Store,
  open: Accessor<boolean>,
  props: Pick<PopupRootProps<Store>, 'open' | 'actionsRef'>,
  animateInitialOpen: MaybeAccessor<boolean>,
  popupRef?: { current: HTMLElement | null },
) {
  const { forceUnmount, transitionStatus } = useOpenStateTransitions(
    open,
    store,
    () => props.open,
    animateInitialOpen,
    popupRef,
  );

  // `useImperativeHandle`: set while mounted, and again when the `actionsRef` prop changes.
  useIsoLayoutEffect(
    () => [props.actionsRef] as const,
    ([actionsRef]) => {
      if (!actionsRef) {
        return undefined;
      }
      actionsRef.current = {
        unmount: forceUnmount,
        close: () => store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction)),
      };
      return () => {
        actionsRef.current = null;
      };
    },
  );

  return transitionStatus;
}

/**
 * Renders what a popup Root renders inside its context provider, in the order it needs:
 *
 * 1. The interactions.
 * 2. `children`, called with the payload when it's a function.
 *
 * Solid port: the handle attachment is not rendered here. Children are rendered lazily, after the
 * effects of later siblings were created, so an attachment rendered as a child would attach after
 * them; React's attachment runs its layout effect before those. `usePopupRoot` attaches the handle
 * from an effect created in the Root's body instead (see `usePopupRootStore`).
 *
 * It's a plain function rather than a component. Call it inside the Root's context provider.
 * `parameters` is read lazily: pass getters (or accessors) for values that change.
 */
export function renderPopupRootChildren<Store, Payload>(parameters: {
  store: Store;
  interactions?: JSX.Element;
  children: JSX.Element | PayloadChildRenderFunction<Payload>;
  payload: Accessor<Payload | undefined>;
}): JSX.Element {
  // The argument of a payload render function, whose `payload` follows the store.
  const renderArg = {
    get payload() {
      return parameters.payload();
    },
  };

  return (
    <>
      {parameters.interactions}
      {(() => {
        const children = parameters.children;
        // Called like a component: reads made in its body don't re-run this expression.
        // A lone component child resolves to what it returns, which can be an accessor (a `<Show>`
        // returns a memo). Like Solid's own control flow, only a function that declares a
        // parameter is a render function; an accessor is left for Solid to insert reactively.
        return typeof children === 'function' && children.length > 0
          ? untrack(() => (children as PayloadChildRenderFunction<Payload>)(renderArg))
          : children;
      })()}
    </>
  );
}

export type PayloadChildRenderFunction<Payload> = (arg: {
  payload: Payload | undefined;
}) => JSX.Element;

/**
 * The subset of a popup handle that a Root needs to bind its store to. Both the real handle classes
 * and any test double satisfy it.
 */
interface PopupRootStoreHandle<Store> {
  attachStore(store: Store): () => void;
}

/**
 * Creates and owns a popup store on behalf of a Root part. The store is created exactly once, with
 * controlled props and root state synced separately after creation. Keeps the default popup id and
 * whether the popup is nested current, and returns the store.
 *
 * @param createStore Factory that builds the store. Called exactly once, receiving the default
 * popup id resolved on the first render.
 * @param defaultPopupId The default popup id, or `undefined` to leave the popup without one.
 * @param handle The handle to attach the store to while the Root is mounted, if any.
 */
function usePopupRootStore<Store extends PopupRootStore>(
  createStore: (defaultPopupId: string | undefined) => Store,
  defaultPopupId: MaybeAccessor<string | undefined>,
  handle: MaybeAccessor<PopupRootStoreHandle<Store> | undefined>,
): Store {
  const parentNodeId = useFloatingParentNodeId();

  // Created once: the props and the default popup id only seed it, so they are read once on
  // purpose.
  const store = untrack(() => createStore(access(defaultPopupId)));

  usePopupHandleAttachment(handle, store);

  store.useSyncedValue('defaultPopupId', () => access(defaultPopupId));
  // Kept current from an effect. A parent's effects run before its children's, so the popup's
  // parts see it before any of their own effects run.
  useIsoLayoutEffect(
    () => [parentNodeId() != null] as const,
    ([nested]) => {
      store.context.nested = nested;
    },
  );

  return store;
}

/**
 * Attaches a Root's store to a handle for the Root's committed lifetime. This lets descendants call
 * the handle during the Root's initial commit without attaching during render, which would leak
 * suspended or abandoned stores. Store subscribers are notified by `attachStore` from an effect.
 *
 * Solid port: React renders this as a `PopupHandleAttachment` child placed before the Root's
 * interactions and user children, so its layout effect runs before the layout effects of the
 * Root's descendants, of the Root itself, and of later siblings. Solid runs a parent's effects
 * before its children's and creates the Root's children lazily, so the attachment is an effect
 * created first thing in the Root's body instead: it runs before the Root's other effects, its
 * descendants' and its later siblings'. It re-attaches when the handle changes and detaches on
 * cleanup, and does nothing for a handle-less Root.
 */
function usePopupHandleAttachment<Store>(
  handle: MaybeAccessor<PopupRootStoreHandle<Store> | undefined>,
  store: Store,
) {
  useIsoLayoutEffect(
    () => [access(handle)] as const,
    ([currentHandle]) => {
      if (!currentHandle) {
        return undefined;
      }
      return currentHandle.attachStore(store);
    },
  );
}

/**
 * Closes the popup when the trigger it belongs to unmounts, if `closeOnActiveTriggerUnmount` is
 * enabled.
 *
 * Which trigger a popup belongs to is derived by the store's selectors from the registered
 * triggers (see `activeTriggerId` in the popup store), so there is nothing to keep in sync here.
 * The store reports the one event that can't be derived: the active trigger of an open popup
 * unregistering. The close is requested after a microtask, so a replacement trigger with the same
 * id that mounts in the same tick can register first.
 *
 * This should be called on the Root part.
 *
 * @param store The Store instance managing the popup state.
 * @param options Options for active trigger unmount behavior.
 */
export function useCloseOnActiveTriggerUnmount<State extends PopupStoreState<unknown>>(
  store: PopupTriggerDataStore<State> & {
    setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails<typeof REASONS.none>): void;
  },
  options: {
    closeOnActiveTriggerUnmount?: MaybeAccessor<boolean | undefined>;
  } = {},
) {
  store.context.onActiveTriggerUnregistered = (lostActiveTriggerId) => {
    if (!untrack(() => access(options.closeOnActiveTriggerUnmount))) {
      return;
    }

    queueMicrotask(() => {
      if (
        store.select('open') &&
        store.select('activeTriggerId') === lostActiveTriggerId &&
        !store.context.triggerElements.getById(lostActiveTriggerId)
      ) {
        const eventDetails = createChangeEventDetails(REASONS.none);
        store.setOpen(false, eventDetails);
        // If closing is canceled, keep the previous active trigger ownership for the still-open
        // popup. Otherwise the popup closes without a trigger: it must not be handed to another
        // trigger while it animates out.
        if (!eventDetails.isCanceled) {
          store.update({
            activeTriggerId: null,
            activeTriggerElement: null,
            openedWithoutTrigger: true,
          } as Pick<State, 'activeTriggerId' | 'activeTriggerElement' | 'openedWithoutTrigger'>);
        }
      }
    });
  };

  onCleanup(() => {
    store.context.onActiveTriggerUnregistered = undefined;
  });
}

/**
 * Returns what the active trigger forwards to the popup (see `useTriggerDataForwarding`), or
 * `undefined` while the popup is not mounted by a trigger that forwards data.
 *
 * A Root derives store values from it with `store.useDerivedValue`.
 */
export function useActiveTriggerData<Data extends object>(
  store: SolidStore<PopupStoreState<unknown>, PopupStoreContext<never>, PopupStoreSelectors>,
): Accessor<Data | undefined> {
  const data = createMemo(() => {
    const state = store.tracked;
    // The data is registered along with the trigger, so a change of the registered triggers can
    // bring the active trigger's data.
    void state.triggers;
    if (!state.mounted) {
      return undefined;
    }
    const triggerId = store.selectTracked('activeTriggerId');
    return triggerId != null ? store.context.triggerData.get(triggerId) : undefined;
  });
  // Compared by value: another trigger often forwards the same data.
  return createMemo(() => data()?.() as Data | undefined, { equals: shallowEqual });
}

/**
 * Manages the mounted state of the popup.
 * Sets up the transition status listeners and handles unmounting when needed.
 * Updates the `mounted`, `transitionStatus`, and `preventUnmountingOnClose` states in the store.
 *
 * @param open Whether the popup is open.
 * @param store The Store instance managing the popup state. It resets its open session through
 *   `resetOnUnmount` once the popup unmounts.
 * @param openProp The Root's `open` prop.
 * @param animateInitialOpen Whether a popup that mounts already open should still play its enter
 *   transition. Defaults to `false`, so content that was open on the first render (a `defaultOpen`
 *   popup on page load, SSR'd markup) appears without animating. Opt in for popups whose subtree
 *   only mounts in response to something the user did, such as a submenu inside a menu popup.
 * @param popupRef The element whose closing animations are awaited before unmounting.
 *
 * @returns The transition status, and a function to forcibly unmount the popup. That function is a
 *   no-op once the popup is already unmounted, so calling it after the automatic unmount doesn't
 *   repeat the completion callback.
 */
function useOpenStateTransitions<State extends PopupStoreState<unknown>>(
  open: Accessor<boolean>,
  store: SolidStore<State, PopupStoreContext<never>, typeof popupStoreSelectors> & {
    resetOnUnmount(): void;
  },
  openProp: Accessor<boolean | undefined>,
  animateInitialOpen?: MaybeAccessor<boolean>,
  popupRef: { current: HTMLElement | null } = store.context.popupRef,
) {
  // In controlled mode, `state.open` holds the last open-change request instead of the open state,
  // and a close through the prop doesn't reset it. Clear it in the commit that receives a closing
  // prop, so `true` on unmount means a request made since then.
  useIsoLayoutEffect(
    () => [openProp()] as const,
    ([currentOpenProp]) => {
      if (currentOpenProp === false) {
        store.set('open', false);
      }
    },
  );

  const { mounted, transitionStatus, forceUnmount } = useUnmountAfterClose({
    open,
    ref: popupRef,
    // The popup part writes its element to the store as it attaches.
    subscribeToAttach: store.subscribe,
    preventUnmountOnClose: store.useState('preventUnmountingOnClose'),
    setPreventUnmountOnClose: (preventUnmountOnClose) =>
      store.set('preventUnmountingOnClose', preventUnmountOnClose),
    animateInitialOpen,
    onUnmount() {
      store.resetOnUnmount();
      store.context.onOpenChangeComplete?.(false);
    },
  });

  // Seed the Root-owned store before parts subscribe, matching the hook's initial mounted state.
  // Otherwise, an initially open Root looks like a reopen until the layout effect syncs the store.
  // The initial value, read once on purpose.
  store.set('mounted', untrack(mounted));

  store.useSyncedValues(() => ({ mounted: mounted(), transitionStatus: transitionStatus() }));

  return { forceUnmount, transitionStatus };
}

export function usePopupRootSync<
  State extends PopupStoreState<unknown> & {
    openMethod: InteractionType | null;
  },
>(
  store: SolidStore<State, PopupStoreContext<never>, typeof popupStoreSelectors>,
  open: MaybeAccessor<boolean>,
) {
  useIsoLayoutEffect(
    () => [access(open)] as const,
    ([isOpen]) => {
      if (!isOpen && store.state.openMethod !== null) {
        store.set('openMethod', null);
      }
    },
  );

  onCleanup(() => {
    if (store.state.openMethod !== null) {
      store.set('openMethod', null);
    }
  });
}
