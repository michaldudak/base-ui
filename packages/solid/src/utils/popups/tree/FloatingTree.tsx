import { createContext, untrack, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useId } from '#utils/useId';
import { useIsoLayoutEffect } from '#utils/useEffect';
import type { FloatingNodeType, FloatingTreeType } from '../types';
import { FloatingTreeStore } from './FloatingTreeStore';

const FloatingNodeContext = createContext<FloatingNodeType | null>(null);
const FloatingTreeContext = createContext<FloatingTreeType | null>(null);

/**
 * Returns the parent node id for nested floating elements, if available.
 * Returns `null` for top-level floating elements.
 */
export const useFloatingParentNodeId = (): Accessor<string | null> => {
  const context = useContext(FloatingNodeContext);
  return () => context?.id || null;
};

/**
 * Returns the nearest floating tree context, if available.
 */
export const useFloatingTree = (externalTree?: FloatingTreeStore): FloatingTreeType | null => {
  const contextTree = useContext(FloatingTreeContext) as FloatingTreeType | null;
  return externalTree ?? contextTree;
};

/**
 * Registers a node into the `FloatingTree`, returning its id.
 * @see https://floating-ui.com/docs/FloatingTree
 */
export function useFloatingNodeId(externalTree?: FloatingTreeStore): string | undefined {
  const id = useId();
  const tree = useFloatingTree(externalTree);
  const parentId = useFloatingParentNodeId();

  useIsoLayoutEffect(
    () => [parentId()] as const,
    ([currentParentId]) => {
      if (!id) {
        return undefined;
      }

      const node = { id, parentId: currentParentId };
      tree?.addNode(node);
      return () => {
        tree?.removeNode(node);
      };
    },
  );

  return id;
}

export interface FloatingNodeProps {
  children?: JSX.Element;
  id: string | undefined;
}

/**
 * Provides parent node context for nested floating elements.
 * @see https://floating-ui.com/docs/FloatingTree
 * @internal
 */
export function FloatingNode(props: FloatingNodeProps): JSX.Element {
  const parentId = useFloatingParentNodeId();

  // A stable object whose fields read the current values.
  const value: FloatingNodeType = {
    get id() {
      return props.id;
    },
    get parentId() {
      return parentId();
    },
  };

  return <FloatingNodeContext value={value}>{props.children}</FloatingNodeContext>;
}

export interface FloatingTreeProps {
  children?: JSX.Element;
  externalTree?: FloatingTreeStore | undefined;
}

/**
 * Provides context for nested floating elements when they are not children of
 * each other on the DOM.
 * This is not necessary in all cases, except when there must be explicit communication between parent and child floating elements. It is necessary for:
 * - The `bubbles` option in the `useDismiss()` Hook
 * - Nested virtual list navigation
 * - Nested floating elements that each open on hover
 * - Custom communication between parent and child floating elements
 * @see https://floating-ui.com/docs/FloatingTree
 * @internal
 */
export function FloatingTree(props: FloatingTreeProps): JSX.Element {
  // Created once, like `useRefWithInit`: the initial `externalTree` is read once on purpose.
  const tree = untrack(() => props.externalTree) ?? new FloatingTreeStore();
  return <FloatingTreeContext value={tree}>{props.children}</FloatingTreeContext>;
}
