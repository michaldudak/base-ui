import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { InteractionType } from '#utils/useEnhancedClickHandler';
import { useEnhancedClickHandler } from '#utils/useEnhancedClickHandler';
import { platform } from '#utils/platform';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import type { HTMLProps } from '../../../internals/types';

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
  // A writable derived signal: the trigger writes the method while the popup opens, and closing
  // the popup resets it. (React resets it from an effect that watches `open`.)
  const [openMethod, setOpenMethod] = createSignal<InteractionType | null>(
    (previous) => (access(open) ? (previous ?? null) : null),
    { ownedWrite: true },
  );

  const triggerProps = useOpenMethodTriggerProps(open, setOpenMethod);

  return {
    openMethod,
    triggerProps,
  };
}
