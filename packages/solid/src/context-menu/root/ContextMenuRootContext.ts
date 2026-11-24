import { createContext, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';
// ContextMenu is out of the port's scope: its open change details are those of the menu it wraps.
import type { MenuRoot } from '../../menu/root/MenuRoot';

export interface ContextMenuRootContext {
  anchor: Accessor<{ getBoundingClientRect: () => DOMRect }>;
  setAnchor: (anchor: { getBoundingClientRect: () => DOMRect }) => void;
  backdropRef: { current: HTMLDivElement | null };
  internalBackdropRef: { current: HTMLDivElement | null };
  actionsRef: {
    current: {
      setOpen: (nextOpen: boolean, eventDetails: MenuRoot.ChangeEventDetails) => void;
    } | null;
  };
  positionerRef: { current: HTMLElement | null };
  allowMouseUpTriggerRef: { current: boolean };
  initialCursorPointRef: { current: { x: number; y: number } | null };
  rootId: Accessor<string | undefined>;
}

export const ContextMenuRootContext = createContext<ContextMenuRootContext | null>(null);

export function useContextMenuRootContext(optional: false): ContextMenuRootContext;
export function useContextMenuRootContext(optional?: true): ContextMenuRootContext | undefined;
export function useContextMenuRootContext(optional = true) {
  const context = useContext(ContextMenuRootContext) ?? undefined;
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI: ContextMenuRootContext is missing. ContextMenu parts must be placed within <ContextMenu.Root>.',
    );
  }
  return context;
}
