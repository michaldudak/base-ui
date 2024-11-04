'use client';
import * as React from 'react';
import PropTypes from 'prop-types';
import { FloatingPortal } from '@floating-ui/react';
import { useComponentRenderer } from '../../utils/useComponentRenderer';
import { usePreviewCardRootContext } from '../Root/PreviewCardContext';
import { usePreviewCardBackdrop } from './usePreviewCardBackdrop';
import { HTMLElementType } from '../../utils/proptypes';
import type { BaseUIComponentProps } from '../../utils/types';
import { type CustomStyleHookMapping } from '../../utils/getStyleHookProps';
import { popupOpenStateMapping as baseMapping } from '../../utils/popupOpenStateMapping';
import type { TransitionStatus } from '../../utils/useTransitionStatus';

const customStyleHookMapping: CustomStyleHookMapping<PreviewCardBackdrop.OwnerState> = {
  ...baseMapping,
  transitionStatus(value) {
    if (value === 'entering') {
      return { 'data-entering': '' } as Record<string, string>;
    }
    if (value === 'exiting') {
      return { 'data-exiting': '' };
    }
    return null;
  },
};

/**
 *
 * Demos:
 *
 * - [Preview Card](https://base-ui.netlify.app/components/react-preview-card/)
 *
 * API:
 *
 * - [PreviewCardBackdrop API](https://base-ui.netlify.app/components/react-preview-card/#api-reference-PreviewCardBackdrop)
 */
const PreviewCardBackdrop = React.forwardRef(function PreviewCardBackdrop(
  props: PreviewCardBackdrop.Props,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const { render, className, keepMounted = false, container, ...otherProps } = props;

  const { open, mounted, transitionStatus } = usePreviewCardRootContext();
  const { getBackdropProps } = usePreviewCardBackdrop();

  const ownerState: PreviewCardBackdrop.OwnerState = React.useMemo(
    () => ({
      open,
      transitionStatus,
    }),
    [open, transitionStatus],
  );

  const { renderElement } = useComponentRenderer({
    propGetter: getBackdropProps,
    render: render ?? 'div',
    className,
    ownerState,
    ref: forwardedRef,
    extraProps: otherProps,
    customStyleHookMapping,
  });

  const shouldRender = keepMounted || mounted;
  if (!shouldRender) {
    return null;
  }

  return <FloatingPortal root={container}>{renderElement()}</FloatingPortal>;
});

namespace PreviewCardBackdrop {
  export interface OwnerState {
    open: boolean;
    transitionStatus: TransitionStatus;
  }

  export type Props = BaseUIComponentProps<'div', OwnerState> & {
    /**
     * Whether the `Backdrop` remains mounted when the Preview Card `Popup` is closed.
     * @default false
     */
    keepMounted?: boolean;
    /**
     * The element the `Backdrop` is appended to.
     */
    container?: HTMLElement | null | React.MutableRefObject<HTMLElement | null>;
  };
}

PreviewCardBackdrop.propTypes /* remove-proptypes */ = {
  // ┌────────────────────────────── Warning ──────────────────────────────┐
  // │ These PropTypes are generated from the TypeScript type definitions. │
  // │ To update them, edit the TypeScript types and run `pnpm proptypes`. │
  // └─────────────────────────────────────────────────────────────────────┘
  /**
   * @ignore
   */
  children: PropTypes.oneOfType([
    PropTypes.element,
    PropTypes.func,
    PropTypes.number,
    PropTypes.shape({
      '__@toStringTag@620': PropTypes.oneOf(['BigInt']).isRequired,
      toLocaleString: PropTypes.func.isRequired,
      toString: PropTypes.func.isRequired,
      valueOf: PropTypes.func.isRequired,
    }),
    PropTypes.shape({
      '__@iterator@96': PropTypes.func.isRequired,
    }),
    PropTypes.shape({
      children: PropTypes.node,
      key: PropTypes.string,
      props: PropTypes.any.isRequired,
      type: PropTypes.oneOfType([PropTypes.func, PropTypes.string]).isRequired,
    }),
    PropTypes.shape({
      '__@toStringTag@620': PropTypes.string.isRequired,
      catch: PropTypes.func.isRequired,
      finally: PropTypes.func.isRequired,
      then: PropTypes.func.isRequired,
    }),
    PropTypes.string,
    PropTypes.bool,
  ]),
  /**
   * Class names applied to the element or a function that returns them based on the component's state.
   */
  className: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  /**
   * The element the `Backdrop` is appended to.
   */
  container: PropTypes /* @typescript-to-proptypes-ignore */.oneOfType([
    HTMLElementType,
    PropTypes.func,
  ]),
  /**
   * Whether the `Backdrop` remains mounted when the Preview Card `Popup` is closed.
   * @default false
   */
  keepMounted: PropTypes.bool,
  /**
   * A function to customize rendering of the component.
   */
  render: PropTypes.oneOfType([PropTypes.element, PropTypes.func]),
} as any;

export { PreviewCardBackdrop };
