import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { getSide, getAlignment, getSideAxis } from '@floating-ui/utils';
import type { Rect } from '@floating-ui/utils';
import { ownerDocument, ownerWindow } from '#utils/owner';
import { useEffect, useIsoLayoutEffect } from '#utils/useEffect';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { autoUpdate } from '@floating-ui/dom';
import type {
  Placement,
  VirtualElement,
  Padding,
  Side as PhysicalSide,
  MiddlewareState,
  AutoUpdateOptions,
  Middleware,
} from '@floating-ui/dom';
import type {
  UseFloatingOptions,
  UseFloatingReturn,
  PositioningInteractionStore,
  PopupPositioningContext,
} from '../utils/popups/types';
import type { FloatingTreeStore } from '../utils/popups/tree/FloatingTreeStore';
import {
  useBaseUIFloating,
  flip,
  limitShift,
  offset,
  shift as floatingShift,
  size,
} from '../utils/popups/positioning/useFloating';
import { useDirection } from './direction-context/DirectionContext';
import { arrow } from '../utils/popups/positioning/arrow';
import { hide } from '../utils/popups/positioning/hideMiddleware';
import { DEFAULT_SIDES } from '../utils/popups/positioning/adaptiveOriginConstants';
import * as CommonPositionerCssVars from '../utils/popups/positioning/CommonPositionerCssVars';

export { useFloatingRootStore } from '../utils/popups/floating-root/useFloatingRootStore';
export type { UseFloatingRootStoreOptions } from '../utils/popups/floating-root/useFloatingRootStore';
export type { FloatingRootStore } from '../utils/popups/floating-root/FloatingRootStore';
export type { PositioningInteractionStore } from '../utils/popups/types';

const AVAILABLE_WIDTH_VAR = CommonPositionerCssVars.availableWidth;
const AVAILABLE_HEIGHT_VAR = CommonPositionerCssVars.availableHeight;

function getLogicalSide(sideParam: Side, renderedSide: PhysicalSide, isRtl: boolean): Side {
  const isLogicalSideParam = sideParam === 'inline-start' || sideParam === 'inline-end';
  const logicalRight = isRtl ? 'inline-start' : 'inline-end';
  const logicalLeft = isRtl ? 'inline-end' : 'inline-start';
  return (
    {
      top: 'top',
      right: isLogicalSideParam ? logicalRight : 'right',
      bottom: 'bottom',
      left: isLogicalSideParam ? logicalLeft : 'left',
    } satisfies Record<PhysicalSide, Side>
  )[renderedSide];
}

function getOffsetData(state: MiddlewareState, sideParam: Side, isRtl: boolean) {
  const { rects, placement } = state;
  const data = {
    side: getLogicalSide(sideParam, getSide(placement), isRtl),
    align: getAlignment(placement) || 'center',
    anchor: { width: rects.reference.width, height: rects.reference.height },
    positioner: { width: rects.floating.width, height: rects.floating.height },
  } as const;
  return data;
}

/**
 * Solid does not append `px` to numeric style values.
 */
function toPx(value: number | undefined) {
  return value == null ? undefined : `${value}px`;
}

export type Side = 'top' | 'bottom' | 'left' | 'right' | 'inline-end' | 'inline-start';
export type Align = 'start' | 'center' | 'end';
export type Boundary = 'clipping-ancestors' | Element | Element[] | Rect;
export type OffsetFunction = (data: {
  side: Side;
  align: Align;
  anchor: { width: number; height: number };
  positioner: { width: number; height: number };
}) => number;

interface SideFlipMode {
  /**
   * How to avoid collisions on the side axis.
   * - `'flip'`: If there is not enough space, place the popup on the opposite side.
   * - `'none'`: Keep the preferred side even if it overflows.
   */
  side?: 'flip' | 'none' | undefined;
  /**
   * How to avoid collisions on the align axis.
   * - `'flip'`: If there is not enough space, swap `'start'` and `'end'` alignment.
   * - `'shift'`: Keep the alignment and shift the popup to fit within the boundary.
   * - `'none'`: Keep the preferred alignment even if it overflows.
   */
  align?: 'flip' | 'shift' | 'none' | undefined;
  /**
   * If both sides on the preferred axis do not fit, determines whether to fallback
   * to a side on the perpendicular axis and which logical side to prefer.
   * - `'start'`: Prefer the logical start side on the perpendicular axis.
   * - `'end'`: Prefer the logical end side on the perpendicular axis.
   * - `'none'`: Do not fallback to the perpendicular axis.
   */
  fallbackAxisSide?: 'start' | 'end' | 'none' | undefined;
}

interface SideShiftMode {
  /**
   * How to avoid collisions on the side axis.
   * - `'shift'`: Keep the preferred side and shift the popup to fit within the boundary.
   * - `'none'`: Keep the preferred side even if it overflows.
   */
  side?: 'shift' | 'none' | undefined;
  /**
   * How to avoid collisions on the align axis.
   * - `'shift'`: Keep the alignment and shift the popup to fit within the boundary.
   * - `'none'`: Keep the preferred alignment even if it overflows.
   */
  align?: 'shift' | 'none' | undefined;
  /**
   * If both sides on the preferred axis do not fit, determines whether to fallback
   * to a side on the perpendicular axis and which logical side to prefer.
   * - `'start'`: Prefer the logical start side on the perpendicular axis.
   * - `'end'`: Prefer the logical end side on the perpendicular axis.
   * - `'none'`: Do not fallback to the perpendicular axis.
   */
  fallbackAxisSide?: 'start' | 'end' | 'none' | undefined;
}

export type CollisionAvoidance = SideFlipMode | SideShiftMode;

type AnchorParameter = UseAnchorPositioningSharedParameters['anchor'];

/**
 * Provides standardized anchor positioning behavior for floating elements. Wraps Floating UI's
 * `useFloating` hook.
 *
 * Parameters are read lazily. `anchor`, `sideOffset` and `alignOffset` accept functions as values,
 * so they are read as plain fields: pass them through getters on the parameters object
 * (`get sideOffset() { return props.sideOffset; }`). The other parameters may be accessors.
 */
export function useAnchorPositioning(
  params: UseAnchorPositioningParameters,
): UseAnchorPositioningReturnValue {
  // Public parameters
  const positionMethod = () => access(params.positionMethod) ?? 'absolute';
  const sideParam = () => access(params.side) ?? 'bottom';
  const sideOffset = () => params.sideOffset ?? 0;
  const align = () => access(params.align) ?? 'center';
  const alignOffset = () => params.alignOffset ?? 0;
  const collisionBoundary = () => access(params.collisionBoundary) ?? 'clipping-ancestors';
  const collisionPaddingParam = () => access(params.collisionPadding) ?? 5;
  const sticky = () => access(params.sticky) ?? false;
  const arrowPadding = () => access(params.arrowPadding) ?? 5;
  const disableAnchorTracking = () => access(params.disableAnchorTracking) ?? false;
  const inlineMiddleware = () => access(params.inline);
  // Private parameters
  const keepMounted = () => access(params.keepMounted) ?? false;
  const interactionStore = params.interactionStore;
  const mounted = () => access(params.mounted);
  const collisionAvoidance = () => access(params.collisionAvoidance);
  const shift = () => access(params.shift);
  const adaptiveOrigin = () => access(params.adaptiveOrigin);
  const lazyFlip = () => access(params.lazyFlip) ?? false;

  const collisionAvoidanceSide = () => collisionAvoidance().side || 'flip';
  const collisionAvoidanceAlign = () => collisionAvoidance().align || 'flip';
  const collisionAvoidanceFallbackAxisSide = () => collisionAvoidance().fallbackAxisSide || 'end';
  const shiftCrossAxis = () => shift()?.crossAxis ?? false;
  const shiftRootBoundary = () => shift()?.rootBoundary;

  const direction = useDirection();
  const isRtl = () => direction() === 'rtl';

  const [mountPlacementState, setMountPlacement] = createSignal<Placement | null>(null, {
    ownedWrite: true,
  });

  // React resets the locked placement during render when the popup unmounts. Here the reset is
  // derived for reads, and the signal is cleared by the effect below.
  const mountPlacement = () => (mounted() ? mountPlacementState() : null);

  useIsoLayoutEffect(
    () => [mounted()] as const,
    ([isMounted]) => {
      if (!isMounted) {
        setMountPlacement(null);
      }
    },
  );

  const lockAlign = () => lazyFlip() === 'placement';
  const side = createMemo((): PhysicalSide => {
    const currentMountPlacement = mountPlacement();
    const mountSide = currentMountPlacement ? getSide(currentMountPlacement) : null;
    return (
      mountSide ||
      (
        {
          top: 'top',
          right: 'right',
          bottom: 'bottom',
          left: 'left',
          'inline-end': isRtl() ? 'left' : 'right',
          'inline-start': isRtl() ? 'right' : 'left',
        } satisfies Record<Side, PhysicalSide>
      )[sideParam()]
    );
  });

  const placementAlign = createMemo((): Align => {
    const currentMountPlacement = mountPlacement();
    const mountAlign =
      currentMountPlacement && lockAlign() ? getAlignment(currentMountPlacement) || 'center' : null;
    return mountAlign || align();
  });
  const placement = createMemo(() =>
    placementAlign() === 'center' ? side() : (`${side()}-${placementAlign()}` as Placement),
  );

  const collisionPadding = createMemo(() => {
    const param = collisionPaddingParam();
    if (typeof param === 'number') {
      return {
        top: param,
        right: param,
        bottom: param,
        left: param,
      };
    }
    return {
      top: param.top || 0,
      right: param.right || 0,
      bottom: param.bottom || 0,
      left: param.left || 0,
    };
  });

  // Create a bias to the preferred side.
  // On iOS, when the mobile software keyboard opens, the input is exactly centered
  // in the viewport, but this can cause it to flip to the top undesirably.
  // The bias is only applied to `flip()` so it doesn't shift the resting position
  // computed by `shift()` and `size()` away from the requested `collisionPadding`.
  const bias = 1;

  const arrowElementRef: { current: Element | null } = { current: null };

  const shiftDisabled = () =>
    collisionAvoidanceAlign() === 'none' && collisionAvoidanceSide() !== 'shift';
  const crossAxisShiftEnabled = () =>
    !shiftDisabled() && (sticky() || shiftCrossAxis() || collisionAvoidanceSide() === 'shift');

  // `mountedRef` in React: the latest value, read by the `size()` middleware.
  const mountedRef = { current: false as boolean | undefined };
  useIsoLayoutEffect(
    () => [mounted()] as const,
    ([isMounted]) => {
      mountedRef.current = isMounted;
    },
  );

  // Recomputed whenever a value it reads changes, like React's per-render array. A new but deeply
  // equal array is ignored by the positioning hook, so the closures below capture the values of
  // the run that produced the array in use; the dependency arrays passed to the middleware make
  // sure a relevant change produces a different array.
  const middleware = createMemo(() => {
    const currentSideParam = sideParam();
    const currentIsRtl = isRtl();
    const currentSideOffset = sideOffset();
    const currentAlignOffset = alignOffset();
    const currentCollisionPadding = collisionPadding();
    const currentSticky = sticky();
    const currentShiftCrossAxis = shiftCrossAxis();
    const currentShiftRootBoundary = shiftRootBoundary();
    const currentCollisionAvoidanceSide = collisionAvoidanceSide();
    const currentCollisionAvoidanceAlign = collisionAvoidanceAlign();
    const currentCrossAxisShiftEnabled = crossAxisShiftEnabled();
    const currentArrowPadding = arrowPadding();
    const currentCollisionBoundary = collisionBoundary();

    const biasTop = currentSideParam === 'bottom' ? bias : 0;
    const biasBottom = currentSideParam === 'top' ? bias : 0;
    const biasLeft = currentSideParam === 'right' ? bias : 0;
    const biasRight = currentSideParam === 'left' ? bias : 0;

    const commonCollisionProps = {
      boundary:
        currentCollisionBoundary === 'clipping-ancestors'
          ? 'clippingAncestors'
          : currentCollisionBoundary,
      padding: currentCollisionPadding,
    } as const;

    // Keep these reactive if they're not functions
    const sideOffsetDep = typeof currentSideOffset !== 'function' ? currentSideOffset : 0;
    const alignOffsetDep = typeof currentAlignOffset !== 'function' ? currentAlignOffset : 0;

    const result: NonNullable<UseFloatingOptions['middleware']> = [];

    const currentInlineMiddleware = inlineMiddleware();
    if (currentInlineMiddleware) {
      result.push(currentInlineMiddleware);
    }

    result.push(
      offset(
        (state) => {
          const data = getOffsetData(state, currentSideParam, currentIsRtl);

          // The latest values, like React's `sideOffsetRef` and `alignOffsetRef`.
          const latestSideOffset = sideOffset();
          const latestAlignOffset = alignOffset();
          const sideAxis =
            typeof latestSideOffset === 'function' ? latestSideOffset(data) : latestSideOffset;
          const alignAxis =
            typeof latestAlignOffset === 'function' ? latestAlignOffset(data) : latestAlignOffset;

          return {
            mainAxis: sideAxis,
            crossAxis: alignAxis,
            alignmentAxis: alignAxis,
          };
        },
        [sideOffsetDep, alignOffsetDep, currentIsRtl, currentSideParam],
      ),
    );

    const flipOptions = {
      ...commonCollisionProps,
      // Ensure the popup flips if it's been limited by its --available-height and it resizes.
      // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
      padding: {
        top: currentCollisionPadding.top + bias + biasTop,
        right: currentCollisionPadding.right + bias + biasRight,
        bottom: currentCollisionPadding.bottom + bias + biasBottom,
        left: currentCollisionPadding.left + bias + biasLeft,
      },
      mainAxis: !currentShiftCrossAxis && currentCollisionAvoidanceSide === 'flip',
      crossAxis: currentCollisionAvoidanceAlign === 'flip' ? ('alignment' as const) : false,
      fallbackAxisSideDirection: collisionAvoidanceFallbackAxisSide(),
    };
    const flipMiddleware =
      currentCollisionAvoidanceSide === 'none'
        ? null
        : flip(
            // Once size() has run in this pass (it may have raised the cap), accept its new cap.
            ({ middlewareData }) =>
              middlewareData.size
                ? { ...flipOptions, padding: currentCollisionPadding }
                : flipOptions,
            [flipOptions],
          );
    const shiftMiddleware = shiftDisabled()
      ? null
      : floatingShift(
          {
            ...commonCollisionProps,
            // Use the Layout Viewport to avoid shifting around when pinch-zooming.
            rootBoundary: currentShiftRootBoundary,
            mainAxis: currentCollisionAvoidanceAlign !== 'none',
            crossAxis: currentCrossAxisShiftEnabled,
            limiter:
              currentSticky || currentShiftCrossAxis
                ? undefined
                : limitShift((limitData) => {
                    if (!arrowElementRef.current) {
                      return {};
                    }
                    const { width, height } = arrowElementRef.current.getBoundingClientRect();
                    const sideAxis = getSideAxis(getSide(limitData.placement));
                    const arrowSize = sideAxis === 'y' ? width : height;
                    const offsetAmount =
                      sideAxis === 'y'
                        ? currentCollisionPadding.left + currentCollisionPadding.right
                        : currentCollisionPadding.top + currentCollisionPadding.bottom;
                    return {
                      offset: arrowSize / 2 + offsetAmount / 2,
                    };
                  }),
          },
          [
            commonCollisionProps,
            currentSticky,
            currentShiftCrossAxis,
            currentShiftRootBoundary,
            currentCollisionPadding,
            currentCollisionAvoidanceAlign,
          ],
        );

    // https://floating-ui.com/docs/flip#combining-with-shift
    // Keyed on the alignment actually being requested, not the raw prop: a locked alignment can
    // differ from `align`, and the ordering has to match the placement that is asked for.
    if (
      currentCollisionAvoidanceSide === 'shift' ||
      currentCollisionAvoidanceAlign === 'shift' ||
      placementAlign() === 'center'
    ) {
      result.push(shiftMiddleware, flipMiddleware);
    } else {
      result.push(flipMiddleware, shiftMiddleware);
    }

    result.push(
      size({
        ...commonCollisionProps,
        apply({ elements: { floating }, availableWidth, availableHeight, rects }) {
          if (!mountedRef.current) {
            return;
          }

          const floatingStyle = floating.style;
          floatingStyle.setProperty(AVAILABLE_WIDTH_VAR, `${availableWidth}px`);
          floatingStyle.setProperty(AVAILABLE_HEIGHT_VAR, `${availableHeight}px`);

          // Snap anchor dimensions to device pixels to ensure the popup's visual width matches the anchor's one.
          const dpr = ownerWindow(floating).devicePixelRatio || 1;
          const { x, y, width, height } = rects.reference;
          const anchorWidth = (Math.round((x + width) * dpr) - Math.round(x * dpr)) / dpr;
          const anchorHeight = (Math.round((y + height) * dpr) - Math.round(y * dpr)) / dpr;

          floatingStyle.setProperty(CommonPositionerCssVars.anchorWidth, `${anchorWidth}px`);
          floatingStyle.setProperty(CommonPositionerCssVars.anchorHeight, `${anchorHeight}px`);
        },
      }),
      arrow(
        (state) => ({
          // `transform-origin` calculations rely on an element existing. If the arrow hasn't been set,
          // we'll create a fake element.
          element:
            arrowElementRef.current || ownerDocument(state.elements.floating).createElement('div'),
          // No padding for the fake arrow: it would displace aligned popups on narrow anchors.
          padding: arrowElementRef.current ? currentArrowPadding : 0,
        }),
        [currentArrowPadding],
      ),
      {
        name: 'transformOrigin',
        fn(state) {
          const {
            elements: { floating },
            middlewareData,
            placement: renderedPlacement,
            platform,
            rects,
            y,
          } = state;

          const renderedSide = getSide(renderedPlacement);
          const renderedAlign = getAlignment(renderedPlacement);
          const isVertical = getSideAxis(renderedSide) === 'y';
          const arrowEl = arrowElementRef.current;

          const sideOffsetValue =
            typeof currentSideOffset === 'function'
              ? currentSideOffset(getOffsetData(state, currentSideParam, currentIsRtl))
              : currentSideOffset;

          // An aligned arrowless popup grows from its aligned edge, until a shift (beyond subpixel)
          // breaks its alignment with the anchor. Everything else grows from the arrow, real or fake.
          let crossOrigin: string;
          if (
            !arrowEl &&
            renderedAlign &&
            Math.abs(isVertical ? middlewareData.shift?.x || 0 : middlewareData.shift?.y || 0) <= 1
          ) {
            // The platform direction, not `isRtl`: it must match what Floating UI placed with.
            crossOrigin =
              (renderedAlign === 'start') === (isVertical && platform.isRTL?.(floating) === true)
                ? '100%'
                : '0%';
          } else {
            const arrowOffset = isVertical
              ? middlewareData.arrow?.x || 0
              : middlewareData.arrow?.y || 0;
            const arrowSize = isVertical ? arrowEl?.clientWidth || 0 : arrowEl?.clientHeight || 0;
            crossOrigin = `${arrowOffset + arrowSize / 2}px`;
          }

          // Side axis: the anchor-facing edge, or the anchor's center when the popup overlaps it.
          let sideOrigin =
            renderedSide === 'top' || renderedSide === 'left'
              ? `calc(100% + ${sideOffsetValue}px)`
              : `${-sideOffsetValue}px`;
          if (
            currentCrossAxisShiftEnabled &&
            isVertical &&
            Math.abs(middlewareData.shift?.y || 0) > sideOffsetValue
          ) {
            sideOrigin = `${rects.reference.y + rects.reference.height / 2 - y}px`;
          }

          floating.style.setProperty(
            CommonPositionerCssVars.transformOrigin,
            isVertical ? `${crossOrigin} ${sideOrigin}` : `${sideOrigin} ${crossOrigin}`,
          );

          return {};
        },
      },
      hide,
      adaptiveOrigin(),
    );

    return result;
  });

  useIsoLayoutEffect(
    () => [mounted()] as const,
    ([isMounted]) => {
      // Ensure positioning doesn't run initially for `keepMounted` elements that
      // aren't initially open.
      if (!isMounted) {
        interactionStore.clearPositioning();
      }
    },
  );

  const autoUpdateOptions = createMemo((): AutoUpdateOptions => ({
    ancestorScroll: !disableAnchorTracking(),
    elementResize: !disableAnchorTracking() && typeof ResizeObserver !== 'undefined',
    layoutShift: !disableAnchorTracking() && typeof IntersectionObserver !== 'undefined',
  }));

  // A function per `autoUpdateOptions` value: the positioning hook reads it when the elements
  // change, so it can't read the options accessor itself.
  const whileElementsMounted = createMemo(() => {
    if (keepMounted()) {
      return undefined;
    }
    const options = autoUpdateOptions();
    return (
      reference: Parameters<typeof autoUpdate>[0],
      floating: Parameters<typeof autoUpdate>[1],
      update: Parameters<typeof autoUpdate>[2],
    ) => autoUpdate(reference, floating, update, options);
  });

  const {
    refs,
    elements,
    x,
    y,
    middlewareData,
    update,
    placement: renderedPlacement,
    context,
    isPositioned,
    floatingStyles: originalFloatingStyles,
  } = useBaseUIFloating({
    rootStore: interactionStore,
    open: () => (keepMounted() ? mounted() : undefined),
    placement,
    middleware,
    strategy: positionMethod,
    get whileElementsMounted() {
      return whileElementsMounted();
    },
    get nodeId() {
      return access(params.nodeId);
    },
    externalTree: params.externalTree,
  });

  // `isPositioned` for the arrow ref, which runs outside a tracking scope.
  const isPositionedRef = { current: false };
  useIsoLayoutEffect(
    () => [isPositioned()] as const,
    ([positioned]) => {
      isPositionedRef.current = positioned;
    },
  );

  // An arrow that mounts or unmounts after the popup is positioned doesn't resize the positioner, so
  // reposition explicitly. Deferred so an anchor that changed in the same commit is registered first.
  // `update` reads the latest middleware, so a stale one can't apply outdated options such as
  // `arrowPadding`.
  // The arrow calls it with `null` when it is removed.
  const arrowRef = (element: Element | null) => {
    arrowElementRef.current = element;
    if (isPositionedRef.current) {
      queueMicrotask(update);
    }
  };

  const adaptiveSides = createMemo(() => middlewareData().adaptiveOrigin || DEFAULT_SIDES);

  // Default to `fixed` when not positioned to prevent `autoFocus` scroll jumps.
  // This ensures the popup is inside the viewport initially before it gets positioned.
  const resolvedPosition = (): 'absolute' | 'fixed' =>
    isPositioned() ? positionMethod() : 'fixed';

  const floatingStyles = createMemo<JSX.CSSProperties>(() => {
    let base: JSX.CSSProperties;
    if (!isPositioned()) {
      // Until a position for the current open is computed, ignore any coordinates retained from a
      // previous open (or from a pass that measured the hidden popup as 0x0). Rendering the
      // full-size popup at such stale coordinates can overflow the layout viewport, which makes
      // mobile Chrome zoom the page out and reflow everything the popup is anchored to.
      base = { position: resolvedPosition(), top: '0', left: '0' };
    } else if (adaptiveOrigin()) {
      const { sideX, sideY } = adaptiveSides();
      base = { position: resolvedPosition(), [sideX]: toPx(x()), [sideY]: toPx(y()) };
    } else {
      base = { ...originalFloatingStyles(), position: resolvedPosition() };
    }

    // Seed the available size vars so consumer `max-height: min(x, var(--available-height))` rules
    // resolve to a valid length on the first positioning pass, before `size()` writes the real
    // values. Without a fallback the unresolved `var()` invalidates the whole declaration, so the
    // popup is measured unconstrained while `flip()` picks its side, against the full content
    // height rather than the capped one. Seeded unconditionally (not only while `!isPositioned`):
    // the keys must stay present with a constant value so the per-property style diff never
    // rewrites them after mount, preserving the px values `size()` sets imperatively. Moving them
    // into the `!isPositioned` branch makes the renderer remove them once positioned, wiping
    // `size()`'s values and leaving the popup unconstrained.
    base[AVAILABLE_WIDTH_VAR] = '100vw';
    base[AVAILABLE_HEIGHT_VAR] = '100vh';

    if (!isPositioned()) {
      base.opacity = '0';
    }
    return base;
  });

  const registeredPositionReferenceRef: { current: Element | VirtualElement | null } = {
    current: null,
  };

  // The anchor, resolved for the effects below. A function anchor is called here, in a tracking
  // scope (React calls it in the effect, which only re-runs when the function itself changes).
  const resolvedAnchorValue = () => {
    const anchorValue: AnchorParameter = params.anchor;
    return typeof anchorValue === 'function' ? anchorValue() : anchorValue;
  };

  useIsoLayoutEffect(
    () => [mounted(), resolvedAnchorValue()] as const,
    ([isMounted, resolvedAnchor]) => {
      if (!isMounted) {
        return;
      }

      const unwrappedElement =
        (isRef(resolvedAnchor) ? resolvedAnchor.current : resolvedAnchor) || null;
      const finalAnchor = unwrappedElement || null;

      if (finalAnchor !== registeredPositionReferenceRef.current) {
        refs.setPositionReference(finalAnchor);
        registeredPositionReferenceRef.current = finalAnchor;
      }
    },
  );

  useEffect(
    () => [mounted(), params.anchor] as const,
    ([isMounted, anchorValue]) => {
      if (!isMounted) {
        return;
      }

      // Refs from parent components may be set after the effect above runs.
      // Therefore, if the anchor is a ref, we need to update the position reference here too.
      if (typeof anchorValue === 'function') {
        return;
      }

      if (isRef(anchorValue) && anchorValue.current !== registeredPositionReferenceRef.current) {
        refs.setPositionReference(anchorValue.current);
        registeredPositionReferenceRef.current = anchorValue.current;
      }
    },
  );

  useEffect(
    () =>
      [
        keepMounted(),
        mounted(),
        elements.reference,
        elements.floating,
        autoUpdateOptions(),
      ] as const,
    ([isKeepMounted, isMounted, reference, floating, options]) => {
      if (isKeepMounted && isMounted && reference && floating) {
        return autoUpdate(reference, floating, update, options);
      }
      return undefined;
    },
  );

  const renderedSide = createMemo(() => getSide(renderedPlacement()));
  const logicalRenderedSide = createMemo(() =>
    getLogicalSide(sideParam(), renderedSide(), isRtl()),
  );
  const renderedAlign = createMemo((): Align => getAlignment(renderedPlacement()) || 'center');
  const anchorHidden = createMemo(() => Boolean(middlewareData().hide?.referenceHidden));

  // Locks the flipped side, and the alignment too when the consumer opts in, while filtering
  // resizes the popup.
  useIsoLayoutEffect(
    () =>
      [
        lazyFlip(),
        lockAlign(),
        mounted(),
        isPositioned(),
        renderedPlacement(),
        renderedSide(),
        renderedAlign(),
        side(),
        placementAlign(),
      ] as const,
    ([
      currentLazyFlip,
      currentLockAlign,
      isMounted,
      positioned,
      currentRenderedPlacement,
      currentRenderedSide,
      currentRenderedAlign,
      currentSide,
      currentPlacementAlign,
    ]) => {
      if (
        currentLazyFlip &&
        isMounted &&
        positioned &&
        (currentRenderedSide !== currentSide ||
          (currentLockAlign && currentRenderedAlign !== currentPlacementAlign))
      ) {
        setMountPlacement(currentRenderedPlacement);
      }
    },
  );

  const arrowStyles = createMemo((): JSX.CSSProperties => ({
    position: 'absolute',
    top: toPx(middlewareData().arrow?.y),
    left: toPx(middlewareData().arrow?.x),
  }));

  const arrowUncentered = createMemo(() => middlewareData().arrow?.centerOffset !== 0);

  return {
    positionerStyles: floatingStyles,
    arrowStyles,
    arrowRef,
    arrowUncentered,
    side: logicalRenderedSide,
    align: renderedAlign,
    physicalSide: renderedSide,
    anchorHidden,
    refs,
    context,
    isPositioned,
    update,
  };
}

function isRef(
  param: Element | VirtualElement | { current: any } | null | undefined,
): param is { current: any } {
  return param != null && 'current' in param;
}

export interface UseAnchorPositioningSharedParameters {
  /**
   * An element to position the popup against.
   * By default, the popup will be positioned against the trigger.
   */
  anchor?:
    | Element
    | null
    | VirtualElement
    | { current: Element | null }
    | (() => Element | VirtualElement | null)
    | undefined;
  /**
   * Determines which CSS `position` property to use.
   * @default 'absolute'
   */
  positionMethod?: 'absolute' | 'fixed' | undefined;
  /**
   * Which side of the anchor element to align the popup against.
   * May automatically change to avoid collisions.
   * @default 'bottom'
   */
  side?: Side | undefined;
  /**
   * Distance between the anchor and the popup in pixels.
   * Also accepts a function that returns the distance to read the dimensions of the anchor
   * and positioner elements, along with its side and alignment.
   *
   * The function takes a `data` object parameter with the following properties:
   * - `data.anchor`: the dimensions of the anchor element with properties `width` and `height`.
   * - `data.positioner`: the dimensions of the positioner element with properties `width` and `height`.
   * - `data.side`: which side of the anchor element the positioner is aligned against.
   * - `data.align`: how the positioner is aligned relative to the specified side.
   *
   * @example
   * ```jsx
   * <Positioner
   *   sideOffset={({ side, align, anchor, positioner }) => {
   *     return side === 'top' || side === 'bottom'
   *       ? anchor.height
   *       : anchor.width;
   *   }}
   * />
   * ```
   *
   * @default 0
   */
  sideOffset?: number | OffsetFunction | undefined;
  /**
   * How to align the popup relative to the specified side.
   * @default 'center'
   */
  align?: Align | undefined;
  /**
   * Additional offset along the alignment axis in pixels.
   * Also accepts a function that returns the offset to read the dimensions of the anchor
   * and positioner elements, along with its side and alignment.
   *
   * The function takes a `data` object parameter with the following properties:
   * - `data.anchor`: the dimensions of the anchor element with properties `width` and `height`.
   * - `data.positioner`: the dimensions of the positioner element with properties `width` and `height`.
   * - `data.side`: which side of the anchor element the positioner is aligned against.
   * - `data.align`: how the positioner is aligned relative to the specified side.
   *
   * @example
   * ```jsx
   * <Positioner
   *   alignOffset={({ side, align, anchor, positioner }) => {
   *     return side === 'top' || side === 'bottom'
   *       ? anchor.width
   *       : anchor.height;
   *   }}
   * />
   * ```
   *
   * @default 0
   */
  alignOffset?: number | OffsetFunction | undefined;
  /**
   * An element or a rectangle that delimits the area that the popup is confined to.
   * @default 'clipping-ancestors'
   */
  collisionBoundary?: Boundary | undefined;
  /**
   * Additional space to maintain from the edge of the collision boundary.
   * @default 5
   */
  collisionPadding?: Padding | undefined;
  /**
   * Whether to maintain the popup in the viewport after
   * the anchor element was scrolled out of view.
   * @default false
   */
  sticky?: boolean | undefined;
  /**
   * Minimum distance to maintain between the arrow and the edges of the popup.
   *
   * Use it to prevent the arrow element from hanging out of the rounded corners of a popup.
   * @default 5
   */
  arrowPadding?: number | undefined;
  /**
   * Whether to disable the popup from tracking any layout shift of its positioning anchor.
   * @default false
   */
  disableAnchorTracking?: boolean | undefined;
  /**
   * Determines how to handle collisions when positioning the popup.
   *
   * `side` controls overflow on the preferred placement axis (`top`/`bottom` or `left`/`right`):
   * - `'flip'`: keep the requested side when it fits; otherwise try the opposite side
   *   (`top` and `bottom`, or `left` and `right`).
   * - `'shift'`: never change side; keep the requested side and move the popup within
   *   the clipping boundary so it stays visible.
   * - `'none'`: do not correct side-axis overflow.
   *
   * `align` controls overflow on the alignment axis (`start`/`center`/`end`):
   * - `'flip'`: keep side, but swap `start` and `end` when the requested alignment overflows.
   * - `'shift'`: keep side and requested alignment, then nudge the popup along the
   *   alignment axis to fit.
   * - `'none'`: do not correct alignment-axis overflow.
   *
   * `fallbackAxisSide` controls fallback behavior on the perpendicular axis when the
   * preferred axis cannot fit:
   * - `'start'`: allow perpendicular fallback and try the logical start side first
   *   (`top` before `bottom`, or `left` before `right` in LTR).
   * - `'end'`: allow perpendicular fallback and try the logical end side first
   *   (`bottom` before `top`, or `right` before `left` in LTR).
   * - `'none'`: do not fallback to the perpendicular axis.
   *
   * When `side` is `'shift'`, explicitly setting `align` only supports `'shift'` or `'none'`.
   * If `align` is omitted, it defaults to `'flip'`.
   *
   * @example
   * ```jsx
   * <Positioner
   *   collisionAvoidance={{
   *     side: 'shift',
   *     align: 'shift',
   *     fallbackAxisSide: 'none',
   *   }}
   * />
   * ```
   *
   */
  collisionAvoidance?: CollisionAvoidance | undefined;
}

/**
 * The shared parameters as the hook takes them: values that accept functions (`anchor`,
 * `sideOffset`, `alignOffset`) are read as plain fields (pass them through getters), the others may
 * be accessors.
 */
type UseAnchorPositioningSharedHookParameters = {
  [K in keyof UseAnchorPositioningSharedParameters]: K extends
    'anchor' | 'sideOffset' | 'alignOffset'
    ? UseAnchorPositioningSharedParameters[K]
    : MaybeAccessor<UseAnchorPositioningSharedParameters[K]>;
};

export interface UseAnchorPositioningParameters extends Omit<
  UseAnchorPositioningSharedHookParameters,
  'collisionAvoidance'
> {
  keepMounted?: MaybeAccessor<boolean | undefined>;
  /**
   * The interaction store the popup is positioned with. Components without a popup store create
   * one with `useFloatingRootStore`.
   */
  interactionStore: PositioningInteractionStore;
  mounted: MaybeAccessor<boolean>;
  nodeId?: MaybeAccessor<string | undefined>;
  adaptiveOrigin?: MaybeAccessor<Middleware | undefined>;
  collisionAvoidance: MaybeAccessor<CollisionAvoidance>;
  shift?: MaybeAccessor<
    | {
        crossAxis?: boolean | undefined;
        rootBoundary?: 'layoutViewport' | undefined;
      }
    | undefined
  >;
  /**
   * Locks a flipped placement so it doesn't flip back eagerly while filtering resizes the
   * popup. `true` locks the side only; `'placement'` also locks the alignment.
   */
  lazyFlip?: MaybeAccessor<boolean | 'placement' | undefined>;
  externalTree?: FloatingTreeStore | undefined;
  /**
   * Optional middleware that can replace the measured reference rect before offsets and collision
   * middleware run. Used by Preview Card to position against a specific inline line box.
   */
  inline?: MaybeAccessor<Middleware | undefined>;
}

export interface UseAnchorPositioningReturnValue {
  positionerStyles: Accessor<JSX.CSSProperties>;
  arrowStyles: Accessor<JSX.CSSProperties>;
  /**
   * Call it with the arrow element, and with `null` when the arrow is removed.
   */
  arrowRef: (element: Element | null) => void;
  arrowUncentered: Accessor<boolean>;
  side: Accessor<Side>;
  align: Accessor<Align>;
  physicalSide: Accessor<PhysicalSide>;
  anchorHidden: Accessor<boolean>;
  refs: UseFloatingReturn['refs'];
  context: PopupPositioningContext;
  isPositioned: Accessor<boolean>;
  update: () => void;
}
