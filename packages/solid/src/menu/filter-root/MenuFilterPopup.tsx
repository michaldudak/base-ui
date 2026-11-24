import { createMemo, merge } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useMenuFilterPopup } from './useMenuFilterPopup';
import type { FloatingFocusManagerProps } from '../../utils/popups/focus/FloatingFocusManager';
import { MenuPopupPlain } from '../popup/MenuPopup';
import type { MenuPopupProps } from '../popup/MenuPopup';
import { useMenuRootContext } from '../root/MenuRootContext';
import { mergeProps } from '../../merge-props';
import { REASONS } from '../../internals/reasons';

/**
 * A container for the filter input and item list.
 * Renders a `<div>` element with a `dialog` role.
 */
export function MenuFilterPopup(props: MenuPopupProps): JSX.Element {
  const { store, orientation } = useMenuRootContext();

  const open = store.useState('open');
  const parent = store.useState('parent');
  const openMethod = store.useState('openMethod');
  const lastOpenChangeReason = store.useState('lastOpenChangeReason');

  const interactionProps = useMenuFilterPopup(orientation);

  const initialFocus = createMemo((): FloatingFocusManagerProps['initialFocus'] => {
    const openedByHover = open() && lastOpenChangeReason() === REASONS.triggerHover;
    const mayFocusInput =
      parent().type !== 'menu' ||
      (open() &&
        (openMethod() === 'keyboard' ||
          lastOpenChangeReason() === REASONS.listNavigation ||
          lastOpenChangeReason() === REASONS.triggerHover ||
          lastOpenChangeReason() === REASONS.triggerPress));

    // The input holds real focus; the popup is never the focus target.
    let result: FloatingFocusManagerProps['initialFocus'] = false;
    if (mayFocusInput) {
      const currentOpenMethod = openMethod();
      result = () => {
        // A tap would raise the on-screen keyboard, but a screen reader press (such as an iOS
        // VoiceOver double-tap) still reports a touch and needs the input focused.
        const touchOpen =
          (currentOpenMethod === 'touch' || currentOpenMethod === 'pen') &&
          !store.context.virtualPress;
        if (openedByHover || touchOpen) {
          return false;
        }
        return store.context.virtualFocusRef?.current ?? false;
      };
    }
    return result;
  });

  // Solid port: `mergeProps(interactionProps, props)` would read every prop eagerly, so the
  // consumer's props are layered over the interaction props reactively, and the handlers both
  // define are merged as `mergeProps` would (the consumer's run first).
  const ownProps = interactionProps();
  const mergedHandlers: Record<string, unknown> = {};
  Object.keys(ownProps).forEach((key) => {
    if (typeof ownProps[key] === 'function') {
      Object.defineProperty(mergedHandlers, key, {
        enumerable: true,
        get() {
          return mergeProps(
            { [key]: ownProps[key] },
            { [key]: (props as Record<string, unknown>)[key] },
          )[key];
        },
      });
    }
  });

  const popupProps = merge(ownProps, props, mergedHandlers, {
    role: 'dialog',
    get initialFocus() {
      return initialFocus();
    },
  }) as MenuPopupProps;

  return <MenuPopupPlain {...popupProps} />;
}
