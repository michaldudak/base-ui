import * as React from 'react';
import PropTypes from 'prop-types';
import type { BaseUIComponentProps } from '../../utils/types';
import { useComponentRenderer } from '../../utils/useComponentRenderer';
import { mergeReactProps } from '../../utils/mergeReactProps';
import { useSelectRootContext } from '../Root/SelectRootContext';
import { useEnhancedEffect } from '../../utils/useEnhancedEffect';
import { useSelectPositionerContext } from '../Positioner/SelectPositionerContext';
import { useEventCallback } from '../../utils/useEventCallback';

const SelectScrollArrow = React.forwardRef(function SelectScrollArrow(
  props: SelectScrollArrow.Props,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const { render, className, direction, ...otherProps } = props;

  const { innerOffset, setInnerOffset, innerFallback, alignToItem, popupRef, touchModality } =
    useSelectRootContext();
  const { isPositioned } = useSelectPositionerContext();

  const ownerState: SelectScrollArrow.OwnerState = React.useMemo(
    () => ({
      direction,
    }),
    [direction],
  );

  const inert = !(!touchModality && alignToItem && !innerFallback);

  const frameRef = React.useRef(-1);

  const [rendered, setRendered] = React.useState(false);

  const getScrollArrowProps = React.useCallback(
    (externalProps = {}) =>
      mergeReactProps<'div'>(externalProps, {
        'aria-hidden': true,
        style: {
          position: 'absolute',
          zIndex: 2147483647, // max z-index
          ...(direction === 'up' && { top: 0 }),
          ...(direction === 'down' && { bottom: 0 }),
        },
        onMouseEnter() {
          if (inert) {
            return;
          }

          let prevNow = Date.now();

          function handleFrame() {
            if (!popupRef.current) {
              return;
            }

            const currentNow = Date.now();
            const msElapsed = currentNow - prevNow;
            prevNow = currentNow;

            const pixelsToScroll = Math.min(
              msElapsed / 2,
              popupRef.current.scrollHeight - popupRef.current.clientHeight,
            );

            const isScrolledToTop = popupRef.current.scrollTop === 0;
            const isScrolledToBottom =
              Math.ceil(popupRef.current.scrollTop + popupRef.current.clientHeight) >=
              popupRef.current.scrollHeight;

            if (msElapsed > 0) {
              if (direction === 'up') {
                setRendered(!isScrolledToTop);
              } else if (direction === 'down') {
                setRendered(!isScrolledToBottom);
              }

              if (
                (direction === 'up' && isScrolledToTop) ||
                (direction === 'down' && isScrolledToBottom)
              ) {
                return;
              }
            }

            const scrollDirection = direction === 'up' ? -1 : 1;
            setInnerOffset((o) => o + scrollDirection * pixelsToScroll);
            frameRef.current = requestAnimationFrame(handleFrame);
          }

          requestAnimationFrame(handleFrame);
        },
        onMouseLeave() {
          cancelAnimationFrame(frameRef.current);
        },
      }),
    [direction, popupRef, setInnerOffset, inert],
  );

  const handleScrollArrowRendered = useEventCallback(() => {
    const popupElement = popupRef.current;
    if (!popupElement) {
      return;
    }

    if (direction === 'up') {
      setRendered(popupElement.scrollTop > 1);
    } else if (direction === 'down') {
      const isScrolledToBottom =
        Math.ceil(popupElement.scrollTop + popupElement.clientHeight) >=
        popupElement.scrollHeight - 1;

      setRendered(!isScrolledToBottom);
    }
  });

  React.useEffect(() => {
    const popupElement = popupRef.current;
    if (!popupElement || inert) {
      return undefined;
    }

    popupElement.addEventListener('wheel', handleScrollArrowRendered);

    return () => {
      popupElement.removeEventListener('wheel', handleScrollArrowRendered);
    };
  }, [inert, popupRef, direction, handleScrollArrowRendered]);

  useEnhancedEffect(() => {
    if (!isPositioned || inert) {
      return;
    }

    handleScrollArrowRendered();
  }, [isPositioned, innerOffset, inert, handleScrollArrowRendered]);

  const { renderElement } = useComponentRenderer({
    propGetter: getScrollArrowProps,
    ref: forwardedRef,
    render: render ?? 'div',
    className,
    ownerState,
    extraProps: otherProps,
  });

  if (!rendered) {
    return null;
  }

  return renderElement();
});

SelectScrollArrow.propTypes /* remove-proptypes */ = {
  // ┌────────────────────────────── Warning ──────────────────────────────┐
  // │ These PropTypes are generated from the TypeScript type definitions. │
  // │ To update them, edit the TypeScript types and run `pnpm proptypes`. │
  // └─────────────────────────────────────────────────────────────────────┘
  /**
   * @ignore
   */
  children: PropTypes.node,
  /**
   * Class names applied to the element or a function that returns them based on the component's state.
   */
  className: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  /**
   * @ignore
   */
  direction: PropTypes.oneOf(['down', 'up']).isRequired,
  /**
   * A function to customize rendering of the component.
   */
  render: PropTypes.oneOfType([PropTypes.element, PropTypes.func]),
} as any;

namespace SelectScrollArrow {
  export interface OwnerState {
    direction: 'up' | 'down';
  }
  export interface Props extends BaseUIComponentProps<'div', OwnerState> {
    direction: 'up' | 'down';
  }
}

export { SelectScrollArrow };
