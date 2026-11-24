import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { InteractionType } from '#utils/useEnhancedClickHandler';
import { useEnhancedClickHandler } from '#utils/useEnhancedClickHandler';
import { platform } from '#utils/platform';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import type { HTMLProps } from '../../../internals/types';
import { useValueChanged } from '../../../internals/useValueChanged';

export function useOpenMethodTriggerProps(
  open: MaybeAccessor<boolean>,
  setOpenMethod: (interactionType: InteractionType | null) => void,
): Accessor<HTMLProps> {
  const handleTriggerClick = (_: MouseEvent, interactionType: InteractionType) => {
    const isOpen = access(open);

    if (!isOpen) {
      setOpenMethod(
        interactionType ||
          // On iOS Safari, the hitslop around touch targets means tapping outside an element's
          // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
          // will be "" in that case.
          (platform.os.ios ? 'touch' : ''),
      );
    }
  };

  const { onClick, onPointerDown } = useEnhancedClickHandler(handleTriggerClick);

  return createMemo<HTMLProps>(() => ({
    onClick,
    onPointerDown,
  }));
}

/**
 * Determines the interaction type (keyboard, mouse, touch, etc.) that opened the component.
 *
 * @param open The open state of the component.
 */
export function useOpenInteractionType(open: MaybeAccessor<boolean>) {
  const [openMethod, setOpenMethod] = createSignal<InteractionType | null>(null, {
    ownedWrite: true,
  });

  const triggerProps = useOpenMethodTriggerProps(open, setOpenMethod);

  useValueChanged(
    () => access(open),
    (previousOpen: boolean) => {
      // `onChange` runs only when the boolean changed, so the current value is the opposite of
      // `previousOpen` (accessors can't be read inside an effect's apply function).
      const currentOpen = !previousOpen;
      if (previousOpen && !currentOpen) {
        setOpenMethod(null);
      }
    },
  );

  return {
    openMethod,
    triggerProps,
  };
}
