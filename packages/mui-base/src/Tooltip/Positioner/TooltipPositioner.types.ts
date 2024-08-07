import type * as React from 'react';
import type { Side, Alignment } from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../utils/types';
import { TooltipPositionerParameters } from './useTooltipPositioner.types';

export interface TooltipPositionerContextValue {
  open: boolean;
  side: Side;
  alignment: Alignment;
  arrowRef: React.MutableRefObject<Element | null>;
  arrowUncentered: boolean;
  arrowStyles: React.CSSProperties;
}

export type TooltipPositionerOwnerState = {
  open: boolean;
  side: Side;
  alignment: Alignment;
};

export interface TooltipPositionerProps
  extends TooltipPositionerParameters,
    BaseUIComponentProps<'div', TooltipPositionerOwnerState> {
  /**
   * The container element to which the tooltip positioner is appended to.
   */
  container?: HTMLElement | null | React.MutableRefObject<HTMLElement | null>;
}
