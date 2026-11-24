import { createMemo, createSignal, flush, merge, onCleanup, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import {
  computePosition,
  flip as baseFlip,
  limitShift as baseLimitShift,
  offset as baseOffset,
  shift as baseShift,
  size as baseSize,
} from '@floating-ui/dom';
import type {
  ComputePositionConfig,
  ComputePositionReturn,
  Middleware,
  MiddlewareData,
  Placement,
  Platform,
  Strategy,
  VirtualElement,
} from '@floating-ui/dom';
import { isElement } from '@floating-ui/utils/dom';
import { useIsoLayoutEffect, useOnMount } from '#utils/useEffect';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useFloatingTree } from '../tree/FloatingTree';
import type {
  PopupPositioningContext,
  PopupInteractionStore,
  NarrowedElement,
  ReferenceType,
  UseFloatingOptions,
  UseFloatingReturn,
} from '../types';

/*
 * `@floating-ui/react-dom` is not available in Solid. What follows reimplements the parts of its
 * `useFloating` hook (and its middleware wrappers) that Base UI relies on, directly on top of
 * `@floating-ui/dom`.
 */

// Fork of `fast-deep-equal` that only does the comparisons we need and compares
// functions
export function deepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a === 'function' && a.toString() === b.toString()) {
    return true;
  }
  let length: number;
  let i: number;
  let keys: string[];
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a)) {
      length = a.length;
      if (length !== b.length) {
        return false;
      }
      for (i = length; i-- !== 0;) {
        if (!deepEqual(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }
    keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) {
      return false;
    }
    for (i = length; i-- !== 0;) {
      if (!{}.hasOwnProperty.call(b, keys[i])) {
        return false;
      }
    }
    for (i = length; i-- !== 0;) {
      const key = keys[i];
      if (!deepEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }
  // eslint-disable-next-line no-self-compare
  return a !== a && b !== b;
}

function getDPR(element: Element) {
  if (typeof window === 'undefined') {
    return 1;
  }
  const win = element.ownerDocument.defaultView || window;
  return win.devicePixelRatio || 1;
}

function roundByDPR(element: Element, value: number) {
  const dpr = getDPR(element);
  return Math.round(value * dpr) / dpr;
}

/*
 * Middleware wrappers of `@floating-ui/react-dom`: they store their dependencies in `options` so
 * that `deepEqual` sees a change when a dependency changes (the options are often functions, which
 * compare equal by source).
 */

type DependencyList = readonly unknown[];

export const offset = (
  options?: Parameters<typeof baseOffset>[0],
  deps?: DependencyList,
): Middleware => {
  const result = baseOffset(options);
  return { name: result.name, fn: result.fn, options: [options, deps] };
};

export const shift = (
  options?: Parameters<typeof baseShift>[0],
  deps?: DependencyList,
): Middleware => {
  const result = baseShift(options);
  return { name: result.name, fn: result.fn, options: [options, deps] };
};

export const limitShift = (
  options?: Parameters<typeof baseLimitShift>[0],
  deps?: DependencyList,
): ReturnType<typeof baseLimitShift> => {
  const result = baseLimitShift(options);
  return { fn: result.fn, options: [options, deps] };
};

export const flip = (
  options?: Parameters<typeof baseFlip>[0],
  deps?: DependencyList,
): Middleware => {
  const result = baseFlip(options);
  return { name: result.name, fn: result.fn, options: [options, deps] };
};

export const size = (
  options?: Parameters<typeof baseSize>[0],
  deps?: DependencyList,
): Middleware => {
  const result = baseSize(options);
  return { name: result.name, fn: result.fn, options: [options, deps] };
};

type PositionData = ComputePositionReturn & { isPositioned: boolean };

/**
 * Options of the positioning hook (`useFloating` of `@floating-ui/react-dom`).
 * Values that changed between renders in React are `MaybeAccessor`s.
 */
export interface UsePositionOptions<RT extends ReferenceType = ReferenceType> {
  /**
   * Where to place the floating element relative to the reference element.
   * @default 'bottom'
   */
  placement?: MaybeAccessor<Placement | undefined>;
  /**
   * The strategy to use when positioning the floating element.
   * @default 'absolute'
   */
  strategy?: MaybeAccessor<Strategy | undefined>;
  /**
   * Array of middleware objects to modify the positioning or provide data for rendering.
   * Compared deeply: a new but equal array doesn't recompute the position.
   */
  middleware?: MaybeAccessor<Array<Middleware | null | undefined | false> | undefined>;
  /**
   * Custom or extended platform object.
   */
  platform?: Platform | undefined;
  /**
   * Externally passed elements.
   */
  elements?: MaybeAccessor<
    | {
        reference?: RT | null | undefined;
        floating?: HTMLElement | null | undefined;
      }
    | undefined
  >;
  /**
   * Whether to use `transform` for positioning instead of `top` and `left` in the `floatingStyles`.
   * @default true
   */
  transform?: MaybeAccessor<boolean | undefined>;
  /**
   * A callback invoked when both the reference and floating elements are mounted, and cleaned up
   * when either is unmounted. Useful for setting up event listeners (e.g. pass `autoUpdate`).
   * It is a callback: read when the elements change, never passed through `access()`. Use a getter
   * on the options object when it is only sometimes provided.
   */
  whileElementsMounted?:
    ((reference: RT, floating: HTMLElement, update: () => void) => () => void) | undefined;
  /**
   * The `open` state of the floating element to synchronize with the `isPositioned` value.
   * @default false
   */
  open?: MaybeAccessor<boolean | undefined>;
}

export interface UsePositionFloatingReturn<RT extends ReferenceType = ReferenceType> {
  x: Accessor<number>;
  y: Accessor<number>;
  placement: Accessor<Placement>;
  strategy: Accessor<Strategy>;
  middlewareData: Accessor<MiddlewareData>;
  /**
   * The boolean that let you know if the floating element has been positioned.
   */
  isPositioned: Accessor<boolean>;
  /**
   * CSS styles to apply to the floating element to position it.
   */
  floatingStyles: Accessor<JSX.CSSProperties>;
  /**
   * Update the position of the floating element, re-rendering the component if required.
   */
  update: () => void;
  /**
   * Object containing the reference and floating refs and reactive setters.
   */
  refs: {
    reference: { current: RT | null };
    floating: { current: HTMLElement | null };
    setReference: (node: RT | null) => void;
    setFloating: (node: HTMLElement | null) => void;
  };
  /**
   * The current elements. Its fields are reactive getters.
   */
  elements: {
    readonly reference: RT | null;
    readonly floating: HTMLElement | null;
  };
}

/**
 * Provides data to position a floating element.
 * Port of `useFloating` from `@floating-ui/react-dom`.
 * @see https://floating-ui.com/docs/useFloating
 */
export function usePosition<RT extends ReferenceType = ReferenceType>(
  options: UsePositionOptions<RT> = {},
): UsePositionFloatingReturn<RT> {
  const placement = () => access(options.placement) ?? 'bottom';
  const strategy = () => access(options.strategy) ?? 'absolute';
  const transform = () => access(options.transform) ?? true;
  const open = () => access(options.open);

  // A writable derived signal: positioning writes it, and closing resets `isPositioned`, so the
  // next open starts unpositioned. (React resets it from a layout effect that watches `open`.)
  const [data, setData] = createSignal<PositionData>(
    (previous) => {
      const current = previous ?? initialData();
      return open() === false && current.isPositioned
        ? { ...current, isPositioned: false }
        : current;
    },
    { ownedWrite: true },
  );

  // Like React's `latestMiddleware` state: a new but deeply equal array keeps the previous one.
  const latestMiddleware = createMemo(() => access(options.middleware) ?? [], {
    equals: deepEqual,
  });

  const [_reference, _setReference] = createSignal<RT | null>(null, { ownedWrite: true });
  const [_floating, _setFloating] = createSignal<HTMLElement | null>(null, { ownedWrite: true });

  const referenceRef: { current: RT | null } = { current: null };
  const floatingRef: { current: HTMLElement | null } = { current: null };

  const setReference = (node: RT | null) => {
    if (node !== referenceRef.current) {
      referenceRef.current = node;
      _setReference(() => node);
    }
  };
  const setFloating = (node: HTMLElement | null) => {
    if (node !== floatingRef.current) {
      floatingRef.current = node;
      _setFloating(() => node);
    }
  };

  const referenceEl = createMemo(() => access(options.elements)?.reference || _reference());
  const floatingEl = createMemo(() => access(options.elements)?.floating || _floating());

  const dataRef: { current: PositionData } = { current: initialData() };
  const openRef = { current: undefined as boolean | undefined };
  // The configuration `update` reads. It is the latest one, like the `update` React recreates
  // whenever the middleware, placement or strategy change.
  const configRef: {
    current: {
      placement: Placement;
      strategy: Strategy;
      middleware: ComputePositionConfig['middleware'];
    };
  } = {
    current: { placement: 'bottom', strategy: 'absolute', middleware: [] },
  };
  const isMountedRef = { current: false };

  const update = () => {
    if (!referenceRef.current || !floatingRef.current) {
      return;
    }

    const config: ComputePositionConfig = {
      placement: configRef.current.placement,
      strategy: configRef.current.strategy,
      middleware: configRef.current.middleware,
    };
    if (options.platform) {
      config.platform = options.platform;
    }

    computePosition(referenceRef.current, floatingRef.current, config).then((computed) => {
      const fullData = {
        ...computed,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: openRef.current !== false,
      };
      if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
        dataRef.current = fullData;
        setData(fullData);
        flush();
      }
    });
  };

  useIsoLayoutEffect(
    () => [open()] as const,
    ([isOpen]) => {
      openRef.current = isOpen;
      // `data` resets itself (see its definition); the mirror follows.
      if (isOpen === false && dataRef.current.isPositioned) {
        dataRef.current = { ...dataRef.current, isPositioned: false };
      }
    },
  );

  useOnMount(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  });

  useIsoLayoutEffect(
    () =>
      [
        referenceEl(),
        floatingEl(),
        placement(),
        strategy(),
        latestMiddleware(),
        options.whileElementsMounted,
      ] as const,
    ([
      reference,
      floating,
      currentPlacement,
      currentStrategy,
      middleware,
      whileElementsMounted,
    ]) => {
      configRef.current = {
        placement: currentPlacement,
        strategy: currentStrategy,
        middleware,
      };
      if (reference) {
        referenceRef.current = reference;
      }
      if (floating) {
        floatingRef.current = floating;
      }
      if (reference && floating) {
        if (whileElementsMounted) {
          return whileElementsMounted(reference, floating, update);
        }
        update();
      }
      return undefined;
    },
  );

  const refs = {
    reference: referenceRef,
    floating: floatingRef,
    setReference,
    setFloating,
  };

  const elements = {
    get reference() {
      return referenceEl();
    },
    get floating() {
      return floatingEl();
    },
  };

  const floatingStyles = createMemo<JSX.CSSProperties>(
    () => {
      const position = strategy();
      const initialStyles: JSX.CSSProperties = {
        position,
        left: '0',
        top: '0',
      };
      const floating = floatingEl();
      if (!floating) {
        return initialStyles;
      }
      const { x: dataX, y: dataY } = data();
      const x = roundByDPR(floating, dataX);
      const y = roundByDPR(floating, dataY);
      if (transform()) {
        return {
          ...initialStyles,
          transform: `translate(${x}px, ${y}px)`,
          ...(getDPR(floating) >= 1.5 && {
            'will-change': 'transform',
          }),
        };
      }
      return {
        position,
        left: `${x}px`,
        top: `${y}px`,
      };
      // A new object with the same styles is not a change.
    },
    { equals: deepEqual },
  );

  onCleanup(() => {
    isMountedRef.current = false;
  });

  return {
    x: () => data().x,
    y: () => data().y,
    placement: () => data().placement,
    strategy: () => data().strategy,
    middlewareData: () => data().middlewareData,
    isPositioned: () => data().isPositioned,
    update,
    refs,
    elements,
    floatingStyles,
  };
}

function initialData(): PositionData {
  return {
    x: 0,
    y: 0,
    strategy: 'absolute',
    placement: 'bottom',
    middlewareData: {},
    isPositioned: false,
  };
}

/**
 * Provides data to position a floating element and context to add interactions.
 * The caller supplies the root store, which owns the reference and floating elements.
 * @see https://floating-ui.com/docs/useFloating
 */
export function useBaseUIFloating(
  options: UseFloatingOptions & { rootStore: PopupInteractionStore },
): UseFloatingReturn {
  const store = options.rootStore;

  const anchor = store.useState('anchor');
  const positionerElement = store.useState('positionerElement');
  const anchorElement = store.useState('anchorElement');
  const open = store.useState('open');
  const defaultPopupId = store.useState('defaultPopupId');

  const [positionerAnchor, setPositionerAnchor] = createSignal<ReferenceType | null>(null, {
    ownedWrite: true,
  });

  const domReferenceRef: { current: NarrowedElement<ReferenceType> | null } = { current: null };

  const tree = useFloatingTree(options.externalTree);

  const storeElements = createMemo(() => ({
    reference: anchor(),
    floating: positionerElement(),
    domReference: anchorElement(),
  }));

  const position = usePosition<ReferenceType>(
    merge(options, {
      elements: () => {
        const currentPositionerAnchor = positionerAnchor();
        return {
          ...storeElements(),
          ...(currentPositionerAnchor && { reference: currentPositionerAnchor }),
        };
      },
    }),
  );

  const setPositionReference = (node: ReferenceType | null) => {
    const computedPositionReference = isElement(node)
      ? ({
          getBoundingClientRect: () => node.getBoundingClientRect(),
          getClientRects: () => node.getClientRects(),
          contextElement: node,
        } satisfies VirtualElement)
      : node;
    // Keep the Positioner's anchor in state when the store also has an anchor, so the store's
    // doesn't replace it on future renders.
    setPositionerAnchor(() => computedPositionReference);
    position.refs.setReference(computedPositionReference);
  };

  const refs = {
    ...position.refs,
    setPositionReference,
    domReference: domReferenceRef,
  };

  const elements = {
    get reference() {
      return position.elements.reference;
    },
    get floating() {
      return position.elements.floating;
    },
    get domReference() {
      return anchorElement() as NarrowedElement<ReferenceType> | null;
    },
  };

  // The context's elements are read on demand by other popups in the tree (React reads them off
  // the context object), from handlers and effects where a tracked read would warn.
  const contextElements = {
    get reference() {
      return untrack(() => elements.reference);
    },
    get floating() {
      return untrack(() => elements.floating);
    },
    get domReference() {
      return untrack(() => elements.domReference);
    },
  };

  const context: PopupPositioningContext = {
    ...position,
    open,
    defaultPopupId,
    refs,
    elements: contextElements,
    // Read on demand, like React reads the context: consumers call it from handlers and effects,
    // where a tracked read would warn. The effect below follows the node id.
    get nodeId() {
      return untrack(() => options.nodeId);
    },
    rootStore: store,
  };

  useIsoLayoutEffect(
    () => [anchorElement()] as const,
    ([element]) => {
      if (element) {
        domReferenceRef.current = element as NarrowedElement<ReferenceType> | null;
      }
    },
  );

  // React assigns these on every render. The context object is stable here, so it is assigned
  // once, and the tree node again whenever the node id changes.
  store.context.positioning = context;

  useIsoLayoutEffect(
    () => [options.nodeId] as const,
    ([nodeId]) => {
      store.context.positioning = context;

      const node = tree?.nodesRef.current.find((n) => n.id === nodeId);
      if (node) {
        node.context = context;
      }
    },
  );

  return {
    ...position,
    context,
    refs,
    elements,
    rootStore: store,
  } as UseFloatingReturn;
}
