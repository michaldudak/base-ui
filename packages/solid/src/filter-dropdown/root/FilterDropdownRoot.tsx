import { createMemo, createSignal, untrack, useContext } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useExternalEffect } from '#utils/useEffect';
import { getFilter } from '../../internals/filter';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { useItemRegistry } from '../../internals/useItemRegistry';
import {
  FilterDropdownRootContext,
  FilterDropdownItemContext,
  FilterDropdownValueContext,
} from './FilterDropdownRootContext';
import type {
  FilterDropdownItemRegistration,
  FilterDropdownFilter,
  FilterDropdownRoot as FilterDropdownRootNamespace,
} from './FilterDropdownRootContext';
import { FilterDropdownStore } from '../store';

/**
 * Holds the filter query, matches it against the registered items, and publishes the result. The
 * host owns list navigation; this root moves the highlight through `setActiveIndex`.
 *
 * @internal
 */
export function FilterDropdownRoot(props: FilterDropdownRoot.Props): JSX.Element {
  const disabled = () => props.disabled ?? false;
  const openedByKeyboard = () => props.openedByKeyboard ?? false;
  const autoHighlight = () => props.autoHighlight ?? false;

  const parentItemContext = useContext(FilterDropdownItemContext);

  const [renderedListId, setRenderedListId] = createSignal<string | undefined>(undefined, {
    ownedWrite: true,
  });
  // Both reset when the host reports a new value; doing it during render skips an extra commit.
  // Solid port: writable derived signals, which reset when `openedByKeyboard` changes.
  const [inputFocusVisible, setInputFocusVisible] = createSignal(() => openedByKeyboard(), {
    ownedWrite: true,
  });
  const [keyboardModality, setKeyboardModality] = createSignal(() => openedByKeyboard(), {
    ownedWrite: true,
  });

  const {
    items: registeredItems,
    registerItem: registerInRegistry,
    liveItems,
  } = useItemRegistry<symbol, FilterDropdownItemRegistration>();

  const defaultId = useBaseUiId();
  const store = new FilterDropdownStore();

  // The count is published as items register, not with the next registry snapshot, so a
  // `Menu.Empty` mounting alongside the items never reads a stale zero.
  const registerItem = (id: symbol, item: FilterDropdownItemRegistration) => {
    const unregister = registerInRegistry(id, item);
    store.set('registeredItemCount', liveItems.size);
    return () => {
      unregister();
      store.set('registeredItemCount', liveItems.size);
    };
  };

  const fallbackFocusOwnerRef = { current: null as HTMLElement | null };
  const lastFilterQueryRef = { current: null as string | null };

  const defaultMatchItem = createMemo(() => getFilter({ locale: props.locale }).contains);

  // Solid port: the host's ref object is stable, so it is read once.
  const focusOwnerRef = untrack(() => props.focusOwnerRef) ?? fallbackFocusOwnerRef;
  const filterQuery = createMemo(() => (props.query ?? props.value).trim());
  // An unused inline filter must not re-run auto-highlighting when the consumer re-renders.
  const matchItem = createMemo(() =>
    filterQuery() === '' || props.filter === null ? null : (props.filter ?? defaultMatchItem()),
  );
  const autoHighlightEnabled = createMemo(
    () =>
      props.open &&
      (autoHighlight() === 'always' || (autoHighlight() !== false && filterQuery() !== '')),
  );
  // React 17 resolves generated ids in an effect, so they must be read live rather than captured
  // in a state initializer.
  const defaultListId = () => {
    const id = defaultId();
    return id ? `${id}-list` : undefined;
  };
  const listId = () => (renderedListId() ?? defaultListId()) || undefined;
  // The host owns the trigger. `null` and `''` both mean no element carries an id to point at.
  const triggerId = () => props.triggerId || undefined;

  // Solid port: the host's list ref and highlight callbacks are stable, so they are read once.
  const listRef = untrack(() => props.listRef);
  const getActiveIndex = () => untrack(() => props.getActiveIndex)();
  const setActiveIndex = (index: number | null) => untrack(() => props.setActiveIndex)(index);

  const handleValueChange = (
    nextValue: string,
    eventDetails: FilterDropdownRoot.ChangeEventDetails,
  ) => {
    untrack(() => props.onValueChange)?.(nextValue, eventDetails);
    // Indexes are positional, so a kept highlight would land on whatever fills its slot.
    // With `autoHighlight`, the filtering effect below places the highlight instead.
    if (!eventDetails.isCanceled && !untrack(autoHighlight)) {
      setActiveIndex(null);
    }
  };

  const handleItemsChange = (previousItems: readonly (HTMLElement | null)[]) => {
    const items = listRef.current;
    const activeIndex = getActiveIndex();

    // A positional highlight must not silently move to another item. A change that leaves the
    // highlighted item in place keeps it, such as an item appended after it or one that renders
    // once before the query filters it out. A query change already reset the highlight.
    if (
      activeIndex != null &&
      items[activeIndex] != null &&
      items[activeIndex] === previousItems[activeIndex]
    ) {
      return;
    }

    setActiveIndex(untrack(autoHighlightEnabled) && items.length > 0 ? 0 : null);
  };

  // Re-runs on the registry snapshot published once every item in the commit has registered,
  // and on the committed query, because a controlled consumer can reject a proposed change. It
  // reads the live registry so items registered in this commit count before their snapshot.
  // The matching reads each item's rendered text, so the result is reported from an effect.
  useExternalEffect(
    () =>
      [
        props.open,
        props.query,
        filterQuery(),
        registeredItems(),
        matchItem(),
        autoHighlightEnabled(),
      ] as const,
    ([open, query, currentFilterQuery, , currentMatchItem, isAutoHighlightEnabled]) => {
      if (!open && query === undefined) {
        return;
      }

      const queryChanged =
        lastFilterQueryRef.current !== null && lastFilterQueryRef.current !== currentFilterQuery;
      lastFilterQueryRef.current = currentFilterQuery;

      // With no query or external filtering, every registered item is visible. External filtering
      // still follows `autoHighlight`; otherwise the item set invalidates the highlight.
      if (currentMatchItem === null) {
        store.set('visibleItemIds', null);
        // Registry updates, such as an item's text changing, keep the current highlight.
        if (isAutoHighlightEnabled && liveItems.size > 0) {
          if (queryChanged || getActiveIndex() == null) {
            setActiveIndex(0);
          }
        } else if (currentFilterQuery === '' && queryChanged) {
          setActiveIndex(null);
        }
        return;
      }

      const currentIds = store.state.visibleItemIds;
      // The popup's content mounts a commit after the root opens. Publishing an empty result before
      // anything registered would hide every item as it arrives and remount the matches.
      if (currentIds === null && liveItems.size === 0) {
        return;
      }

      const nextIds = new Set<symbol>();
      let hasNewMatch = currentIds === null;
      liveItems.forEach(({ getText }, id) => {
        const text = getText();
        if (text != null && currentMatchItem(text, currentFilterQuery)) {
          nextIds.add(id);
          hasNewMatch ||= !currentIds?.has(id);
        }
      });

      // New matches or a smaller result set invalidate the previous item identities.
      if (hasNewMatch || currentIds?.size !== nextIds.size) {
        // The first filtered snapshot can land after initial keyboard navigation in React 18. It
        // has no prior result identity to invalidate, unless the controlled query itself changed.
        if (isAutoHighlightEnabled && nextIds.size > 0) {
          setActiveIndex(0);
        } else if (currentIds !== null || queryChanged) {
          setActiveIndex(null);
        }
        store.set('visibleItemIds', nextIds);
      } else if (isAutoHighlightEnabled && queryChanged && nextIds.size > 0) {
        setActiveIndex(0);
      }
    },
  );

  const contextValue: FilterDropdownRootContext = {
    open: () => props.open,
    disabled,
    inputFocusVisible,
    setInputFocusVisible: (visible) => setInputFocusVisible(visible),
    keyboardModality,
    setKeyboardModality: (nextKeyboardModality) => setKeyboardModality(nextKeyboardModality),
    autoHighlight,
    triggerId,
    defaultListId,
    listId,
    setRenderedListId: (id) => setRenderedListId(id),
    focusOwnerRef,
    setActiveIndex,
    onItemsChange: handleItemsChange,
    onValueChange: handleValueChange,
  };

  const itemContextValue: FilterDropdownItemContext = {
    parent: parentItemContext,
    store,
    registerItem,
    listRef,
  };

  return (
    <FilterDropdownItemContext value={itemContextValue}>
      <FilterDropdownRootContext value={contextValue}>
        <FilterDropdownValueContext value={() => props.query ?? props.value}>
          {props.children}
        </FilterDropdownValueContext>
      </FilterDropdownRootContext>
    </FilterDropdownItemContext>
  );
}

export interface FilterDropdownRootProps {
  children?: JSX.Element;
  /**
   * Whether the popup is currently open.
   */
  open: boolean;
  /** Whether the filter controls should be disabled. */
  disabled?: boolean | undefined;
  /** Whether the popup opened from the keyboard, so the input starts with its focus ring. */
  openedByKeyboard?: boolean | undefined;
  /**
   * Locale used for filtering comparisons.
   */
  locale?: Intl.LocalesArgument | undefined;
  /**
   * The filter input value.
   */
  value: string;
  /**
   * Query used for filtering when it differs from the input value, such as while closing.
   */
  query?: string | undefined;
  /**
   * Event handler called when the filter input value changes.
   */
  onValueChange?:
    | ((value: string, eventDetails: FilterDropdownRootNamespace.ChangeEventDetails) => void)
    | undefined;
  /**
   * Custom filter logic used when filtering items. Pass `null` to turn filtering off.
   */
  filter?: FilterDropdownFilter | null | undefined;
  /** Whether the first matching item should be highlighted automatically. */
  autoHighlight?: boolean | 'always' | undefined;
  /**
   * ID of a trigger rendered outside this root, which cannot register itself through the context.
   */
  triggerId?: string | null | undefined;
  /**
   * The host's DOM-ordered list of item elements.
   */
  listRef: { current: Array<HTMLElement | null> };
  /**
   * Reads the host's highlighted index.
   */
  getActiveIndex: () => number | null;
  /**
   * Moves the host's highlight.
   */
  setActiveIndex: (index: number | null) => void;
  /**
   * The host's ref for the input, which holds real focus while the list is navigated virtually.
   */
  focusOwnerRef?: { current: HTMLElement | null } | undefined;
}

export namespace FilterDropdownRoot {
  export type Props = FilterDropdownRootProps;
  export type ChangeEventReason = FilterDropdownRootNamespace.ChangeEventReason;
  export type ChangeEventDetails = FilterDropdownRootNamespace.ChangeEventDetails;
}
