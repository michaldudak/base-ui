import { createSignal, onCleanup, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { useCompositeListContext } from './CompositeListContext';
import type { CompositeListContextValue } from './CompositeListContext';

export interface UseCompositeListItemParameters<Metadata> {
  /**
   * Whether to guess the initial index from render order, avoiding a re-render after mount for
   * flat lists.
   * Read once, when the item is created.
   * @default false
   */
  guess?: MaybeAccessor<boolean | undefined>;
  index?: MaybeAccessor<number | undefined>;
  label?: MaybeAccessor<string | null | undefined>;
  /**
   * Metadata published with the item. Keep object values referentially stable to avoid
   * unnecessarily re-registering the item.
   */
  metadata?: MaybeAccessor<Metadata | undefined>;
  /** Keep the ref object stable to avoid unnecessarily reattaching the item. */
  textRef?: { current: HTMLElement | null } | undefined;
  /** The list to register with, in place of the one provided through `CompositeListContext`. */
  list?: CompositeListContextValue<Metadata> | undefined;
}

interface UseCompositeListItemReturnValue {
  ref: (node: HTMLElement) => void;
  index: Accessor<number>;
}

interface CompositeListItemHandle<Metadata> {
  element: HTMLElement | null;
  /** The index the item renders with: the initial guess, then the last one the list delivered. */
  index: number;
  setIndex: (index: number) => void;
  /** The values of the current registration, to re-register only when one of them changes. */
  registered: RegisteredValues<Metadata> | null;
}

interface RegisteredValues<Metadata> {
  externalIndex: number | undefined;
  metadata: Metadata | undefined;
  label: string | null | undefined;
}

/**
 * Used to register a list item and its index (DOM position) in the `CompositeList`.
 *
 * Solid port: the item registers synchronously from its `ref` callback (the element exists there
 * but is not in the document yet) and unregisters when it is disposed. The list resolves the
 * index from its effect, after the element is inserted, and delivers it through `index`, which is
 * an accessor. An effect re-registers the item when `index`, `label` or `metadata` change, which
 * React did by re-attaching the callback ref.
 */
export function useCompositeListItem<Metadata>(
  params: UseCompositeListItemParameters<Metadata> = {},
): UseCompositeListItemReturnValue {
  const { textRef, list } = params;

  const contextList = useCompositeListContext();
  const { register, unregister, guessIndex } = list ?? contextList;

  // Guess the index from the render order. This avoids a re-render after mount for
  // flat lists rendered in DOM order; when the guess is wrong (grouped or out-of-order
  // rendering), the list's flush corrects it before paint.
  // The initial value is read once, like React's state initializer.
  const initialIndex = untrack(() =>
    access(params.index) == null && access(params.guess) ? guessIndex() : -1,
  );
  const [internalIndex, setInternalIndex] = createSignal<number>(initialIndex, {
    ownedWrite: true,
  });
  const index = () => access(params.index) ?? internalIndex();

  const handle = createHandle<Metadata>(initialIndex, setInternalIndex);

  function registerElement(node: HTMLElement, values: RegisteredValues<Metadata>) {
    if (handle.element) {
      unregister(handle.element);
    }

    handle.element = node;
    handle.registered = values;

    register(node, {
      metadata: values.metadata ?? null,
      index: values.externalIndex ?? null,
      label: values.label,
      textRef,
      setIndex: handle.setIndex,
    });
  }

  // Deliberately identity-sensitive: nested items sharing one DOM node rely on ref attachment
  // order to decide which registration wins.
  const ref = (node: HTMLElement) => {
    // A snapshot of the current values; the effect below re-registers when they change.
    registerElement(
      node,
      untrack(() => ({
        externalIndex: access(params.index),
        metadata: access(params.metadata),
        label: access(params.label),
      })),
    );
  };

  useIsoLayoutEffect(
    () => [access(params.index), access(params.metadata), access(params.label)] as const,
    ([externalIndex, metadata, label]) => {
      const node = handle.element;
      const registered = handle.registered;
      if (
        !node ||
        (registered &&
          registered.externalIndex === externalIndex &&
          registered.metadata === metadata &&
          registered.label === label)
      ) {
        return;
      }

      registerElement(node, { externalIndex, metadata, label });
    },
  );

  onCleanup(() => {
    if (handle.element) {
      unregister(handle.element);
      handle.element = null;
      handle.registered = null;
    }
  });

  return { ref, index };
}

function createHandle<Metadata>(
  initialIndex: number,
  setInternalIndex: (index: number) => void,
): CompositeListItemHandle<Metadata> {
  const handle: CompositeListItemHandle<Metadata> = {
    element: null,
    index: initialIndex,
    registered: null,
    setIndex(index) {
      // An unchanged index is filtered here to spare the item an update.
      if (handle.index !== index) {
        handle.index = index;
        setInternalIndex(index);
      }
    },
  };
  return handle;
}
