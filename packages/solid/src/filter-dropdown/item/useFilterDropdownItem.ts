import { createSignal, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { useFilterDropdownItemContext } from '../root/FilterDropdownRootContext';
import type { FilterDropdownItemContext } from '../root/FilterDropdownRootContext';
import { useFilterDropdownGroupContext } from '../group/FilterDropdownGroupContext';
import { DETACHED_OWNER } from '../store';

/**
 * Text of the rendered children, for when the element is filtered out and has no DOM node.
 *
 * Solid port: Solid children are already rendered values (strings, numbers, DOM nodes, arrays
 * and accessors), so the text is read from them rather than from element descriptions.
 */
function childrenText(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(childrenText).join('');
  }
  if (typeof children === 'function') {
    return childrenText(children());
  }
  if (children != null && typeof children === 'object' && 'nodeType' in children) {
    return (children as Node).textContent ?? '';
  }
  return '';
}

/**
 * Solid port: reading Solid children creates them. A child that needs a context provided inside
 * the item (an indicator, for example) throws when created outside it, so a failed read reports
 * no text (`undefined`) and the cached text is kept.
 */
function readChildrenText(read: () => unknown): string | undefined {
  try {
    return childrenText(read());
  } catch {
    return undefined;
  }
}

export interface UseFilterDropdownItemParameters {
  /**
   * A text representation of the item used for filtering. Falls back to the rendered text.
   */
  label?: string | undefined;
  /**
   * Keeps the nearest group visible while this filtered-out item must remain mounted.
   */
  retainGroup?: boolean | undefined;
  /**
   * The item's children, watched so a changed label re-registers against the active query.
   */
  children?: JSX.Element | undefined;
  /**
   * The item's `render` prop, watched like `children` since its element can carry the text.
   */
  render?: unknown;
  /**
   * The dropdown that owns this item, when it isn't the nearest one. A filterable submenu's
   * trigger sits inside its own submenu's root but belongs to the enclosing list.
   */
  context?: FilterDropdownItemContext | null | undefined;
}

export interface UseFilterDropdownItemReturnValue {
  /**
   * Whether the item matches the current query and should render.
   */
  visible: Accessor<boolean>;
  /**
   * Ref for the rendered element, used to read its text when no `label` is given.
   * Solid port: a callback that records the element until it is removed.
   */
  ref: (element: HTMLElement) => void;
}

/**
 * Registers an item with the enclosing filter root and reports whether the query keeps it.
 *
 * The item renders once before it is registered so its rendered text can be read and cached: a
 * popup can open with a query that already excludes the item, and a hidden item has no text left
 * to match against.
 *
 * Solid port: `params` is read lazily (the item parts pass an object with getters), except
 * `context`, which is fixed for the lifetime of the item.
 *
 * @internal
 */
export function useFilterDropdownItem(
  params: UseFilterDropdownItemParameters,
): UseFilterDropdownItemReturnValue {
  // Solid port: the owning context is fixed for a mounted item, so it is read once.
  const context = untrack(() => params.context);

  const nearestContext = useFilterDropdownItemContext(context !== undefined);
  const groupContext = useFilterDropdownGroupContext();

  const owner = context === undefined ? nearestContext : context;
  const { registerItem, store } = owner ?? DETACHED_OWNER;
  const registerGroupItem = groupContext?.registerItem;

  const itemId = Symbol('filter-dropdown-item');
  const ref = { current: null as HTMLElement | null };
  const registeredTextRef = { current: undefined as string | undefined };

  const matched = store.useState('isItemVisible', itemId);

  // An initial item is visible before registration (`visibleItemIds` is null), so start
  // registered and skip the mount re-render. A late item under an active filter starts
  // unregistered and renders once so its DOM text can be captured.
  // Solid port: the initial value is read once.
  const [registered, setRegistered] = createSignal(untrack(matched), { ownedWrite: true });

  // Solid port: a ref is never called with `null`. The element of an item the query filtered out
  // is removed from the document, which stands in for React clearing the ref.
  const setElement = (element: HTMLElement) => {
    ref.current = element;
  };
  const getElement = () => (ref.current?.isConnected ? ref.current : null);

  const visible = () => !registered() || matched();

  // What the children last read as, to tell whether they changed while the item rendered no text.
  const childrenTextRef = { current: undefined as string | undefined };

  // Solid port: takes the label and the children's text (read by the caller in a tracking scope,
  // `undefined` when unknown) instead of reading them through refs.
  const resolveText = (label: string | undefined, fromChildren: string | undefined) => {
    if (label != null) {
      return label;
    }
    // An item without children can carry its text in its `render` element instead.
    // Solid port: the `render` prop has no element form, so only the children are read.
    const previousChildrenText = childrenTextRef.current;
    if (fromChildren !== undefined) {
      childrenTextRef.current = fromChildren;
    }
    const element = getElement();
    if (element !== null) {
      return element.textContent ?? '';
    }
    // A filtered-out item has no DOM node left. Its children are only a stand-in for the text it
    // renders, which can differ (a translation component, for example), so the cached text wins
    // unless the children changed.
    // Solid port: the children are only read while the item has no element, so the first read
    // after it was filtered out has nothing to compare with and keeps the cached text too.
    if (
      registeredTextRef.current !== undefined &&
      (fromChildren === undefined ||
        previousChildrenText === undefined ||
        fromChildren === previousChildrenText)
    ) {
      return registeredTextRef.current;
    }
    return fromChildren ?? '';
  };

  const register = (label: string | undefined, resolvedText: string) => {
    const text = resolvedText;
    if (text) {
      registeredTextRef.current = text;
    }
    return registerItem(itemId, {
      getText() {
        // A mounted item reports what it renders now, even nothing, since a descendant can change
        // its text without the item re-rendering. A filtered-out item falls back to the cached
        // text.
        const element = getElement();
        if (label == null && element) {
          registeredTextRef.current = element.textContent ?? '';
        }
        return registeredTextRef.current;
      },
    });
  };

  // Solid port: `register` changes identity with the label in React, which re-runs this effect.
  useIsoLayoutEffect(
    () => [params.label] as const,
    ([label]) => {
      const unregister = register(label, resolveText(label, undefined));
      setRegistered(true);
      return unregister;
    },
  );

  useIsoLayoutEffect(
    () => [params.retainGroup ?? false] as const,
    ([retainGroup]) => registerGroupItem?.(itemId, retainGroup),
  );

  // Re-register when the item's text changes, so the active query runs again.
  // Solid port: the children are read (which tracks them) only while the item is hidden, since
  // reading Solid children creates them; a rendered item's text is read from its element whenever
  // the query runs.
  let firstTextRun = true;
  useIsoLayoutEffect(
    () =>
      [params.label, visible() ? undefined : readChildrenText(() => params.children)] as const,
    ([label, fromChildren]) => {
      if (firstTextRun) {
        // Solid port: the registration effect above already resolved the text on mount.
        firstTextRun = false;
        if (fromChildren !== undefined) {
          childrenTextRef.current = fromChildren;
        }
        return;
      }
      const text = resolveText(label, fromChildren);
      if (text !== registeredTextRef.current) {
        registeredTextRef.current = text;
        // Solid port: re-registers alongside the registration effect's entry, which the effect's
        // cleanup removes, like React's `void register(text)`.
        void register(label, text);
      }
    },
  );

  return { visible, ref: setElement };
}
