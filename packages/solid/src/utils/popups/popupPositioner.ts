import { omit, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { SolidStore } from '#utils/store';
import { useAnchorPositioning } from '../../internals/useAnchorPositioning';
import { POPUP_COLLISION_AVOIDANCE } from '../../internals/constants';
import type {
  Align,
  Side,
  UseAnchorPositioningParameters,
  UseAnchorPositioningReturnValue,
  UseAnchorPositioningSharedParameters,
} from '../../internals/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import type { AdaptiveOriginMiddleware } from './positioning/adaptiveOriginConstants';
import { usePositioner } from './positioning/usePositioner';
import type { PositioningInteractionStore } from './types';
import type { PopupStoreContext, PopupStoreSelectors, PopupStoreState } from './store';

/**
 * The state every popup Positioner shares.
 */
export interface PopupPositionerState {
  open: boolean;
  side: Side;
  align: Align;
  anchorHidden: boolean;
  instant: string | undefined;
}

type PopupPositionerStoreState = PopupStoreState<unknown> & {
  instantType: string | undefined;
  adaptiveOrigin: AdaptiveOriginMiddleware | undefined;
};

type PopupPositionerStore = SolidStore<
  PopupPositionerStoreState,
  PopupStoreContext<never>,
  PopupStoreSelectors & {
    instantType: (state: PopupPositionerStoreState) => string | undefined;
    adaptiveOrigin: (state: PopupPositionerStoreState) => AdaptiveOriginMiddleware | undefined;
  }
> &
  PositioningInteractionStore;

export interface UsePopupPositionerOptions<State extends PopupPositionerState> {
  /**
   * An additional ref for the positioner element. The component's own `ref` prop is already
   * applied from `componentProps`.
   */
  forwardedRef?: ((element: HTMLDivElement) => void) | undefined;
  /**
   * Whether the popup stays mounted while closed.
   */
  keepMounted: boolean | Accessor<boolean>;
  /**
   * Positioning parameters that replace the props, such as values derived from the popup's parent.
   * An object whose fields may be getters; every key it has replaces the prop.
   */
  positioning?:
    | Partial<
        Omit<
          UseAnchorPositioningParameters,
          'interactionStore' | 'mounted' | 'keepMounted' | 'adaptiveOrigin'
        >
      >
    | undefined;
  /**
   * State that the part adds to or changes in the shared state.
   * An object whose fields are getters; every key it has replaces the shared one.
   */
  state?: (Omit<State, keyof PopupPositionerState> & Partial<PopupPositionerState>) | undefined;
  /**
   * Whether the positioner ignores pointer events.
   * @default !open
   */
  inert?: boolean | Accessor<boolean | undefined> | undefined;
}

export interface UsePopupPositionerReturnValue {
  /**
   * The positioner element. It is created when first read: read it once, inside the part's
   * context providers.
   */
  readonly element: JSX.Element;
  positioning: UseAnchorPositioningReturnValue;
  open: Accessor<boolean>;
  mounted: Accessor<boolean>;
}

/**
 * Returns `base` with every key of `overrides` replaced by a getter reading `overrides`, like
 * `{ ...base, ...overrides }` without reading the values (both may be objects with getters).
 */
function overlay<T extends object, O extends object>(base: T, overrides: O | undefined): T & O {
  const result = {} as T & O;
  const sources: object[] = overrides ? [base, overrides] : [base];
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const keys = Object.keys(source);
    for (let j = 0; j < keys.length; j += 1) {
      const key = keys[j];
      Object.defineProperty(result, key, {
        enumerable: true,
        configurable: true,
        get: () => (source as Record<string, unknown>)[key],
      });
    }
  }
  return result;
}

/**
 * Runs what every popup Positioner does: it positions the popup against its anchor, registers the
 * positioner element, and renders it with the shared state.
 * The part adds what is specific to its popup, such as a backdrop or a scroll lock.
 */
export function usePopupPositioner<State extends PopupPositionerState>(
  store: PopupPositionerStore,
  componentProps: BaseUIComponentProps<'div', State> & UseAnchorPositioningSharedParameters,
  options: UsePopupPositionerOptions<State>,
): UsePopupPositionerReturnValue {
  const elementProps = omit(
    componentProps,
    'render',
    'class',
    'style',
    'anchor',
    'positionMethod',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
    'collisionBoundary',
    'collisionPadding',
    'arrowPadding',
    'sticky',
    'disableAnchorTracking',
    'collisionAvoidance',
  );

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const transitionStatus = store.useState('transitionStatus');
  const instantType = store.useState('instantType');
  const adaptiveOrigin = store.useState('adaptiveOrigin');

  const positioning = useAnchorPositioning(
    overlay(
      {
        get anchor() {
          return componentProps.anchor;
        },
        interactionStore: store,
        positionMethod: () => componentProps.positionMethod,
        mounted,
        side: () => componentProps.side,
        get sideOffset() {
          return componentProps.sideOffset;
        },
        align: () => componentProps.align,
        get alignOffset() {
          return componentProps.alignOffset;
        },
        arrowPadding: () => componentProps.arrowPadding,
        collisionBoundary: () => componentProps.collisionBoundary,
        collisionPadding: () => componentProps.collisionPadding,
        sticky: () => componentProps.sticky,
        disableAnchorTracking: () => componentProps.disableAnchorTracking,
        keepMounted: options.keepMounted,
        collisionAvoidance: () => componentProps.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE,
        adaptiveOrigin,
      } satisfies UseAnchorPositioningParameters,
      options.positioning,
    ),
  );

  // The part's state is an object of getters: its keys replace the shared ones, and its values are
  // read lazily.
  const state = overlay(
    {
      get open() {
        return open();
      },
      get side() {
        return positioning.side();
      },
      get align() {
        return positioning.align();
      },
      get anchorHidden() {
        return positioning.anchorHidden();
      },
      get instant() {
        return instantType();
      },
    },
    options.state,
  ) as State;

  const setPositionerElement = (element: HTMLDivElement | null) => {
    store.set('positionerElement', element);
  };
  onCleanup(() => setPositionerElement(null));

  // The element is created when it is first read, so that a part reading it inside its own
  // context providers gives the positioner's children access to them (see guide 3.5).
  let element: JSX.Element | undefined;
  let created = false;
  const createElement = () =>
    usePositioner(componentProps, state, {
      styles: positioning.positionerStyles,
      transitionStatus,
      props: elementProps,
      refs: [options.forwardedRef, setPositionerElement],
      hidden: () => !mounted(),
      inert: () => {
        const inert = options.inert;
        return (typeof inert === 'function' ? inert() : inert) ?? !open();
      },
    });

  return {
    get element() {
      if (!created) {
        created = true;
        element = createElement();
      }
      return element;
    },
    positioning,
    open,
    mounted,
  };
}
