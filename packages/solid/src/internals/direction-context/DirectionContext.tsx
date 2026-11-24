import { createContext, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';

export type TextDirection = 'ltr' | 'rtl';

export type DirectionContext = {
  direction: Accessor<TextDirection>;
};

export const DirectionContext = createContext<DirectionContext | null>(null);

const DEFAULT_DIRECTION: Accessor<TextDirection> = () => 'ltr';

export function useDirection(): Accessor<TextDirection> {
  const context = useContext(DirectionContext);

  return context?.direction ?? DEFAULT_DIRECTION;
}
