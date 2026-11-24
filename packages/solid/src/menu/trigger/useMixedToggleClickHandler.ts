import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import { ownerDocument } from '#utils/owner';
import { EMPTY_OBJECT } from '#utils/empty';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import type { BaseUIEvent, HTMLProps } from '../../internals/types';

/**
 * Returns `click` and `mousedown` handlers that fix the behavior of triggers of popups that are toggled by different events.
 * For example, a button that opens a popup on mousedown and closes it on click.
 * This hook prevents the popup from closing immediately after the mouse button is released.
 */
export function useMixedToggleClickHandler(
  params: UseMixedToggleClickHandlerParameters,
): Accessor<HTMLProps> {
  const ignoreClickRef = { current: false };

  const handlers = {
    onMouseDown(event: MouseEvent) {
      const mouseDownAction = access(params.mouseDownAction);
      const open = access(params.open);
      if ((mouseDownAction === 'open' && !open) || (mouseDownAction === 'close' && open)) {
        ignoreClickRef.current = true;

        ownerDocument(event.currentTarget as Element).addEventListener(
          'click',
          () => {
            ignoreClickRef.current = false;
          },
          { once: true },
        );
      }
    },
    onClick(event: BaseUIEvent<MouseEvent>) {
      if (ignoreClickRef.current) {
        ignoreClickRef.current = false;
        event.preventBaseUIHandler();
      }
    },
  };

  return createMemo<HTMLProps>(() => {
    if (!(access(params.enabled) ?? true)) {
      return EMPTY_OBJECT;
    }

    return handlers;
  });
}

export interface UseMixedToggleClickHandlerParameters {
  /**
   * Whether the mixed toggle click handler is enabled.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined>;
  /**
   * Determines what action is performed on mousedown.
   */
  mouseDownAction: MaybeAccessor<'open' | 'close'>;
  /**
   * The current open state of the popup.
   */
  open: MaybeAccessor<boolean>;
}

export interface UseMixedToggleClickHandlerState {}
