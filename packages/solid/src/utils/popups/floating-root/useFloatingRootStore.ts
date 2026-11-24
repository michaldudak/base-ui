import { untrack } from 'solid-js';
import { useId } from '#utils/useId';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { PopupTriggerMap } from '../popupTriggerMap';
import type { BaseUIChangeEventDetails } from '../../../internals/createBaseUIEventDetails';
import { useFloatingParentNodeId } from '../tree/FloatingTree';
import { FloatingRootStore } from './FloatingRootStore';
import type { FloatingRootState as State } from './FloatingRootStore';

/**
 * What `useFloatingRootStore` syncs into its store.
 */
export interface UseFloatingRootStoreOptions {
  /**
   * Whether the popup is open. Positioning clears the anchor while the popup isn't mounted, and
   * syncs it in again only when `open` or `elements.anchor` changes, so `open` must follow
   * `mounted`.
   * @default false
   */
  open?: MaybeAccessor<boolean | undefined>;
  /**
   * Called when an interaction hook requests an open change.
   */
  onOpenChange?(open: boolean, eventDetails: BaseUIChangeEventDetails<string>): void;
  /**
   * The elements to sync into the store. A key left `undefined` keeps the store's current value.
   */
  elements?:
    | {
        /**
         * The DOM element the popup is anchored to. To position against a virtual element, pass it
         * as `useAnchorPositioning`'s `anchor` instead.
         */
        anchor?: MaybeAccessor<Element | null | undefined>;
        /**
         * The popup's positioner element, or the popup itself when it has no positioner.
         */
        positionerElement?: MaybeAccessor<HTMLElement | null | undefined>;
      }
    | undefined;
}

/**
 * Creates a `FloatingRootStore` for components that manage their open state without a popup
 * store. The open state, anchor and positioner element are synced into it from a layout effect
 * whenever they change; `onOpenChange` and the nesting flag are kept current as well.
 *
 * `options` is read lazily (it may be an object with getters).
 */
export function useFloatingRootStore(options: UseFloatingRootStoreOptions): FloatingRootStore {
  const open = () => access(options.open) ?? false;
  const anchor = () => access(options.elements?.anchor);
  const positionerElement = () => access(options.elements?.positionerElement);

  const defaultPopupId = useId();
  const parentNodeId = useFloatingParentNodeId();

  // Created once from the initial values, read once on purpose.
  const store = untrack(
    () =>
      new FloatingRootStore({
        open: open(),
        onOpenChange: options.onOpenChange,
        anchorElement: anchor() ?? null,
        positionerElement: positionerElement() ?? null,
        triggerElements: new PopupTriggerMap(),
        defaultPopupId,
        nested: parentNodeId() != null,
      }),
  );

  useIsoLayoutEffect(
    () => [open(), anchor(), positionerElement()] as const,
    ([isOpen, anchorElement, currentPositionerElement]) => {
      const valuesToSync = { open: isOpen, defaultPopupId } as Pick<
        State,
        'open' | 'defaultPopupId' | 'anchorElement' | 'positionerElement'
      >;

      if (anchorElement !== undefined) {
        valuesToSync.anchorElement = anchorElement;
      }

      if (currentPositionerElement !== undefined) {
        valuesToSync.positionerElement = currentPositionerElement;
      }

      store.update(valuesToSync);
    },
  );

  // React assigns these on every render. The callback is read when called, so it is always the
  // latest; the nesting flag follows the parent node.
  store.context.onOpenChange = (nextOpen, eventDetails) =>
    options.onOpenChange?.(nextOpen, eventDetails);
  useIsoLayoutEffect(
    () => [parentNodeId() != null] as const,
    ([nested]) => {
      store.context.nested = nested;
    },
  );

  return store;
}
