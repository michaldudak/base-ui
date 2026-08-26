'use client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { ReactStore } from '@base-ui/utils/store';
import { Timeout } from '@base-ui/utils/useTimeout';
import { NOOP } from '@base-ui/utils/empty';
import { type InteractionType } from '@base-ui/utils/useEnhancedClickHandler';
import { type PopoverRoot } from '../root/PopoverRoot';
import { REASONS } from '../../internals/reasons';
import { NullStore } from '../../utils/NullStore';
import {
  attachPreventUnmountOnClose,
  createInitialPopupStoreState,
  PopupStoreContext,
  popupStoreSelectors,
  PopupStoreState,
  PopupTriggerMap,
  type PopupTriggerStoreKeys,
  createPopupOpenState,
} from '../../utils/popups';
import { PATIENT_CLICK_THRESHOLD } from '../../internals/constants';
import type { AdaptiveOriginMiddleware } from '../../utils/adaptiveOriginConstants';

export type State<Payload> = PopupStoreState<Payload> & {
  disabled: boolean;
  instantType: 'dismiss' | 'click' | 'focus' | 'trigger-change' | undefined;
  modal: boolean | 'trap-focus';
  focusManagerModal: boolean;
  openMethod: InteractionType | null;
  /**
   * The reason of the most recent accepted *open* request, preserved across close until the popup
   * unmounts.
   *
   * A change reason becomes the *close* reason the moment the popup closes, so it cannot answer
   * "how was this opened?" during an exit animation. Everything that must keep behaving the way the
   * session started reads this instead: the focus manager's modal mode and initial focus, both
   * backdrops, and the trigger's hover and pressed rules.
   *
   * `inert` is not one of them — a closed popup is inert regardless of how it was opened, because
   * every session now hands focus back at close.
   *
   * Popover needs only this open provenance. Menu still keeps a `openChangeReason` that flips to
   * the close reason, and `Menu.Backdrop` reads it as though it were an open reason; that is
   * deliberately left alone here.
   */
  openReason: PopoverRoot.ChangeEventReason | null;
  /**
   * Bumped by every controlled open request. Raw `open` alone cannot force reconciliation: a batch
   * that opens and closes again leaves it back on the value the root already saw.
   */
  controlledRequestVersion: number;
  stickIfOpen: boolean;
  titleElementId: string | undefined;
  descriptionElementId: string | undefined;
  openOnHover: boolean;
  closeDelay: number;
  adaptiveOrigin: AdaptiveOriginMiddleware | undefined;
};

/**
 * Everything an in-flight controlled request would have committed, held until the consumer either
 * reflects the request back through `open` or declines it by leaving the prop alone.
 */
interface PendingControlledRequest<Payload> {
  /** Raw `open` before the first request of this batch, and the value a decline restores. */
  baselineOpen: boolean;
  requestedOpen: boolean;
  openReason: PopoverRoot.ChangeEventReason | null;
  instantType: State<Payload>['instantType'];
  preventUnmountingOnClose: boolean;
  startStickIfOpen: boolean;
}

type Context = PopupStoreContext<PopoverRoot.ChangeEventDetails> & {
  readonly popupRef: React.RefObject<HTMLElement | null>;
  readonly triggerFocusTargetRef: React.RefObject<HTMLElement | null>;
  readonly beforeContentFocusGuardRef: React.RefObject<HTMLElement | null>;
  readonly stickIfOpenTimeout: Timeout;
  pendingControlledRequest: PendingControlledRequest<any> | null;
};

const selectors = {
  ...popupStoreSelectors,
  disabled: (state: State<unknown>) => state.disabled,
  instantType: (state: State<unknown>) => state.instantType,
  openMethod: (state: State<unknown>) => state.openMethod,
  openReason: (state: State<unknown>) => state.openReason,
  /** The internal open value, before the controlled prop overrides it. */
  rawOpen: (state: State<unknown>) => state.open,
  controlledRequestVersion: (state: State<unknown>) => state.controlledRequestVersion,
  modal: (state: State<unknown>) => state.modal,
  focusManagerModal: (state: State<unknown>) => state.focusManagerModal,
  stickIfOpen: (state: State<unknown>) => state.stickIfOpen,
  titleElementId: (state: State<unknown>) => state.titleElementId,
  descriptionElementId: (state: State<unknown>) => state.descriptionElementId,
  openOnHover: (state: State<unknown>) => state.openOnHover,
  closeDelay: (state: State<unknown>) => state.closeDelay,
  adaptiveOrigin: (state: State<unknown>): AdaptiveOriginMiddleware | undefined =>
    state.adaptiveOrigin,
};

type Selectors = typeof selectors;

/**
 * The store view that detached handle-backed triggers read from. Both the real `PopoverStore` and
 * the inert fallback store satisfy it, so a trigger can read from whichever store the handle
 * currently exposes. Narrowed to the members a trigger actually uses — the trigger-data members plus
 * `setOpen` (called by the focus guards) — so the exposed surface can't bypass the open-change
 * pipeline; on the detached fallback store every one of these mutations is a no-op.
 */
export type PopoverHandleStore<Payload> = Pick<
  PopoverStore<Payload>,
  PopupTriggerStoreKeys | 'setOpen'
>;

export class PopoverStore<Payload> extends ReactStore<
  Readonly<State<Payload>>,
  Context,
  Selectors
> {
  constructor(
    initialState: Partial<State<Payload>>,
    floatingId: string | undefined,
    nested: boolean,
  ) {
    const triggerElements = new PopupTriggerMap();
    super(
      createInitialState<Payload>(initialState, triggerElements, floatingId, nested),
      createInitialContext(triggerElements),
      selectors,
    );
  }

  setOpen = (
    nextOpen: boolean,
    eventDetails: Omit<PopoverRoot.ChangeEventDetails, 'preventUnmountOnClose'>,
  ) => {
    const isHover = eventDetails.reason === REASONS.triggerHover;
    const isKeyboardClick =
      eventDetails.reason === REASONS.triggerPress &&
      (eventDetails.event as MouseEvent).detail === 0;
    const isDismissClose =
      !nextOpen && (eventDetails.reason === REASONS.escapeKey || eventDetails.reason == null);

    const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(
      eventDetails as PopoverRoot.ChangeEventDetails,
    );

    const activeTriggerId = this.select('activeTriggerId');

    if (
      !nextOpen &&
      eventDetails.reason === REASONS.closePress &&
      eventDetails.trigger == null &&
      activeTriggerId != null
    ) {
      eventDetails.trigger =
        this.context.triggerElements.getById(activeTriggerId) ??
        this.select('activeTriggerElement') ??
        undefined;
    }

    this.context.onOpenChange?.(nextOpen, eventDetails as PopoverRoot.ChangeEventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    this.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);

    // A request that does not move raw `open` reclassifies the session that is already running —
    // an impatient click promoting a hover-opened popover to a press session. There is nothing for
    // a controlled consumer to accept, so it commits immediately either way.
    const isDeferred = this.state.openProp !== undefined && nextOpen !== this.state.open;

    let instantType: State<Payload>['instantType'];
    if (isKeyboardClick) {
      instantType = 'click';
    } else if (isDismissClose) {
      instantType = 'dismiss';
    } else if (eventDetails.reason === REASONS.focusOut) {
      instantType = 'focus';
    }

    const changeState = () => {
      const popupOpenState = createPopupOpenState(
        this.state,
        nextOpen,
        eventDetails.trigger,
        shouldPreventUnmountOnClose(),
      );

      // Every accepted open request reclassifies the session, not just a closed -> open edge. A
      // close carries the classification forward, because everything gated on it has to keep
      // behaving the way the session started until the popup actually unmounts.
      const openReason = nextOpen ? eventDetails.reason : this.state.openReason;

      if (!isDeferred) {
        this.update({ ...popupOpenState, openReason });
        return;
      }

      // Raw `open` and trigger ownership land now: raw `open` is what makes the request
      // observable to the root, and ownership is overwritten by whichever request the consumer
      // does accept. Everything that describes the session itself waits, so a request the
      // consumer declines cannot leave its reason, its transition style, or its unmount override
      // behind to be picked up by a later programmatic change.
      this.context.pendingControlledRequest = {
        baselineOpen: this.context.pendingControlledRequest?.baselineOpen ?? this.state.open,
        requestedOpen: nextOpen,
        openReason,
        instantType,
        preventUnmountingOnClose: popupOpenState.preventUnmountingOnClose,
        startStickIfOpen: isHover,
      };

      this.update({
        ...popupOpenState,
        preventUnmountingOnClose: this.state.preventUnmountingOnClose,
        controlledRequestVersion: this.state.controlledRequestVersion + 1,
      });
    };

    if (isHover) {
      if (!isDeferred) {
        this.startStickIfOpenWindow();
      }

      ReactDOM.flushSync(changeState);
    } else {
      changeState();
    }

    if (!isDeferred) {
      this.set('instantType', instantType);
    }
  };

  /**
   * Only allow "patient" clicks to close the popover if it's open.
   * If they clicked within 500ms of the popover opening, keep it open.
   */
  private startStickIfOpenWindow() {
    this.set('stickIfOpen', true);
    this.context.stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
      this.set('stickIfOpen', false);
    });
  }

  /**
   * Settles a controlled `open` value against the request that may have asked for it.
   *
   * Must run before the controlled prop is written into the store, so it still observes the raw
   * value the request left behind — and so a deferred commit lands before the effective `open`
   * transition it belongs to is processed. `useControlledOpenProvenance` owns that ordering.
   */
  reconcileControlledOpen = (openProp: boolean | undefined) => {
    if (openProp === undefined) {
      return;
    }

    const pending = this.context.pendingControlledRequest;
    if (pending) {
      this.context.pendingControlledRequest = null;

      // Checked before acceptance: a batch that opened and closed again lands back on its own
      // baseline, and as far as the consumer is concerned nothing in it happened.
      if (openProp === pending.baselineOpen) {
        if (this.state.open !== pending.baselineOpen) {
          this.set('open', pending.baselineOpen);
        }
        return;
      }

      if (openProp === pending.requestedOpen) {
        this.update({
          openReason: pending.openReason,
          instantType: pending.instantType,
          preventUnmountingOnClose: pending.preventUnmountingOnClose,
        });

        if (pending.startStickIfOpen) {
          this.startStickIfOpenWindow();
        }

        return;
      }
    }

    if (this.state.open === openProp) {
      return;
    }

    // Either nothing was in flight or the prop moved somewhere no request asked for: the parent
    // moved the state itself, which is a programmatic session with no interaction reason.
    if (openProp) {
      this.update({ open: true, openReason: null });
    } else {
      // Mirror a direct close into raw `open`, otherwise the next direct open would look like
      // acceptance of this one. The session reason survives until unmount: the popup is still
      // closing, and everything gated on it must keep behaving the way the session started.
      this.set('open', false);
    }
  };
}

/**
 * Creates the inert fallback store used by detached handle-backed triggers while no
 * `Popover.Root` is attached. It preserves a popover-specific trigger registry in context so
 * detached triggers can register before migrating to the live root store. `setOpen` is a no-op
 * (matching the inert reads/writes of `NullStore`), so a trigger can hand the store to focus-guard
 * helpers that expect `setOpen` without it ever taking effect while detached.
 */
export function createNullPopoverStore<Payload>(): PopoverHandleStore<Payload> {
  const triggerElements = new PopupTriggerMap();

  const store = new NullStore<Readonly<State<Payload>>, Context, Selectors>(
    Object.freeze(createInitialState<Payload>(undefined, triggerElements)),
    Object.freeze(createInitialContext(triggerElements)),
    selectors,
  );
  return Object.assign(store, { setOpen: NOOP });
}

function createInitialState<Payload>(
  initialState: Partial<State<Payload>> | undefined,
  triggerElements: PopupTriggerMap,
  floatingId?: string | undefined,
  nested = false,
): State<Payload> {
  const state: State<Payload> = {
    ...createInitialPopupStoreState<Payload>(triggerElements, floatingId, nested),
    disabled: false,
    modal: false,
    focusManagerModal: false,
    instantType: undefined,
    openMethod: null,
    openReason: null,
    controlledRequestVersion: 0,
    titleElementId: undefined,
    descriptionElementId: undefined,
    stickIfOpen: true,
    openOnHover: false,
    closeDelay: 0,
    adaptiveOrigin: undefined,
    ...initialState,
  };

  if (state.open && initialState?.mounted === undefined) {
    state.mounted = true;
  }

  return state;
}

function createInitialContext(triggerElements: PopupTriggerMap): Context {
  return {
    popupRef: React.createRef<HTMLElement>(),
    onOpenChange: undefined,
    onOpenChangeComplete: undefined,
    triggerFocusTargetRef: React.createRef<HTMLElement>(),
    beforeContentFocusGuardRef: React.createRef<HTMLElement>(),
    stickIfOpenTimeout: new Timeout(),
    pendingControlledRequest: null,
    triggerElements,
  };
}
