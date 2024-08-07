import type { Side, Alignment } from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../utils/types';

export type TooltipArrowOwnerState = {
  open: boolean;
  side: Side;
  alignment: Alignment;
};

export interface TooltipArrowProps extends BaseUIComponentProps<'div', TooltipArrowOwnerState> {
  /**
   * If `true`, the arrow will be hidden when it can't point to the center of the anchor element.
   * @default false
   */
  hideWhenUncentered?: boolean;
}
