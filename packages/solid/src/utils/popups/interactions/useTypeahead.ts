import { createMemo, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { useTimeout } from '#utils/useTimeout';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '#utils/empty';
import { contains } from '#utils/shadowDom';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { isElementVisible, isListIndexDisabled } from '../../../internals/composite/listIndex';
import type { DisabledIndices } from '../../../internals/composite/listIndex';
import type { HTMLProps } from '../../../internals/types';
import type { PopupInteractionStore } from '../types';
import { stopEvent } from '../event';

export interface UseTypeaheadProps {
  /**
   * A ref which contains an array of strings whose indices match the HTML
   * elements of the list.
   * @default empty list
   */
  listRef: { current: Array<string | null> };
  /**
   * The index of the active (focused or highlighted) item in the list.
   * @default null
   */
  activeIndex: MaybeAccessor<number | null>;
  /**
   * Callback invoked with the matching index if found as the user types.
   */
  onMatch?: ((index: number, event: KeyboardEvent) => void) | undefined;
  /**
   * Optional list of item elements that correspond to `listRef` indices.
   * When an element exists for an index, typeahead skips it if it is hidden by
   * `display: none`, `visibility: hidden|collapse`, other browser-reported
   * visibility checks, or native disabled state.
   */
  elementsRef?: { current: Array<HTMLElement | null> } | undefined;
  /**
   * Indices that are disabled, either as an array or a predicate (the same shape as
   * `useListNavigation`'s `disabledIndices`). Disabled items are skipped while matching,
   * so a single keypress advances to the next selectable item (matching native `<select>`
   * and arrow-key navigation). The explicit disabled check doesn't read `elementsRef`, so
   * consumers whose items stay mounted-but-hidden while closed can still skip disabled items
   * without passing `elementsRef`.
   *
   * Solid port: a predicate must be wrapped in an accessor (`() => predicate`), since a bare
   * function is read as an accessor.
   */
  disabledIndices?: ReadonlyArray<number> | Accessor<DisabledIndices | undefined> | undefined;
  /**
   * Callback invoked with the current typing activity as the user types.
   */
  onTyping?: ((isTyping: boolean) => void) | undefined;
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined>;
  /**
   * The number of milliseconds to wait before resetting the typed string.
   * @default 750
   */
  resetMs?: MaybeAccessor<number | undefined>;
  /**
   * The index of the selected item in the list, if available.
   * @default null
   */
  selectedIndex?: MaybeAccessor<number | null | undefined>;
}

export interface UseTypeaheadReturnValue {
  reference: Accessor<HTMLProps>;
  floating: Accessor<HTMLProps>;
}

/**
 * Provides a matching callback that can be used to focus an item as the user
 * types, often used in tandem with `useListNavigation()`.
 * @see https://floating-ui.com/docs/useTypeahead
 */
export function useTypeahead(
  store: PopupInteractionStore,
  props: UseTypeaheadProps,
): UseTypeaheadReturnValue {
  const listRef = props.listRef;
  const elementsRef = props.elementsRef;
  const activeIndex = () => access(props.activeIndex);
  const disabledIndices = (): DisabledIndices | undefined => {
    const value = props.disabledIndices;
    return typeof value === 'function' ? value() : value;
  };
  const enabled = () => access(props.enabled) ?? true;
  const resetMs = () => access(props.resetMs) ?? 750;
  const selectedIndex = () => access(props.selectedIndex) ?? null;

  const onTyping = (isTyping: boolean) => props.onTyping?.(isTyping);
  const open = store.useState('open');

  const timeout = useTimeout();
  const stringRef = { current: '' };
  // The initial value is read once, like React's `useRef` initializer.
  const prevIndexRef: { current: number | null } = {
    current: untrack(() => selectedIndex() ?? activeIndex() ?? -1),
  };
  const matchIndexRef: { current: number | null } = { current: null };

  const onKeyDown = (event: KeyboardEvent) => {
    const currentDisabledIndices = disabledIndices();
    const currentSelectedIndex = selectedIndex();
    const currentActiveIndex = activeIndex();

    function getElement(index: number) {
      return elementsRef?.current[index];
    }

    function isItemAvailable(index: number) {
      const element = getElement(index);
      if ((element && !isElementVisible(element)) || element?.matches(':disabled')) {
        return false;
      }
      // Visibility and native disabled state are handled above; pass an empty
      // element list so `isListIndexDisabled` resolves only the explicit
      // `disabledIndices` (array/predicate) and skips its own fallbacks.
      // Consumers that don't pass `disabledIndices` keep matching every visible
      // item except native disabled elements provided through `elementsRef`.
      return (
        currentDisabledIndices == null ||
        !isListIndexDisabled(EMPTY_ARRAY, index, currentDisabledIndices)
      );
    }

    function getMatchingIndex(list: Array<string | null>, string: string, startIndex = 0) {
      if (list.length === 0) {
        return -1;
      }

      const normalizedStartIndex = ((startIndex % list.length) + list.length) % list.length;
      const lowerString = string.toLowerCase();

      for (let offset = 0; offset < list.length; offset += 1) {
        const index = (normalizedStartIndex + offset) % list.length;
        const text = list[index];
        if (!text?.toLowerCase().startsWith(lowerString) || !isItemAvailable(index)) {
          continue;
        }
        return index;
      }
      return -1;
    }

    const listContent = listRef.current;

    if (stringRef.current.length > 0 && event.key === ' ') {
      // Space should continue the in-progress typeahead session.
      stopEvent(event);
      onTyping(true);
    }

    if (stringRef.current.length > 0 && stringRef.current[0] !== ' ') {
      if (getMatchingIndex(listContent, stringRef.current) === -1 && event.key !== ' ') {
        onTyping(false);
      }
    }

    if (
      listContent == null ||
      // Character key.
      event.key.length !== 1 ||
      // Modifier key.
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    if (open() && event.key !== ' ') {
      stopEvent(event);
      onTyping(true);
    }

    // Capture whether this is a new typing session before mutating the string.
    const isNewSession = stringRef.current === '';
    if (isNewSession) {
      prevIndexRef.current = currentSelectedIndex ?? currentActiveIndex ?? -1;
    }

    // Bail out if the list contains a word like "llama" or "aaron". TODO:
    // allow it in this case, too. Unavailable items are skipped while matching, so
    // they must be ignored here as well — otherwise a hidden or disabled double-letter
    // label would block rapid cycling through the available items.
    const allowRapidSuccessionOfFirstLetter = listContent.every((text, index) =>
      text && isItemAvailable(index) ? text[0]?.toLowerCase() !== text[1]?.toLowerCase() : true,
    );

    // Allows the user to cycle through items that start with the same letter
    // in rapid succession.
    if (allowRapidSuccessionOfFirstLetter && stringRef.current === event.key) {
      stringRef.current = '';
      prevIndexRef.current = matchIndexRef.current;
    }

    stringRef.current += event.key;
    timeout.start(resetMs(), () => {
      stringRef.current = '';
      prevIndexRef.current = matchIndexRef.current;
      onTyping(false);
    });

    // Compute the starting index for this search.
    // If this is a new typing session (string is empty), base it on the current
    // selection/active item; otherwise continue from the last matched index.
    const prevIndex = isNewSession
      ? (currentSelectedIndex ?? currentActiveIndex ?? -1)
      : prevIndexRef.current;
    const startIndex = (prevIndex ?? 0) + 1;

    const index = getMatchingIndex(listContent, stringRef.current, startIndex);

    if (index !== -1) {
      props.onMatch?.(index, event);
      matchIndexRef.current = index;
    } else if (event.key !== ' ') {
      stringRef.current = '';
      onTyping(false);
    }
  };

  const onBlur = (event: FocusEvent) => {
    const next = event.relatedTarget as Element | null;
    const currentDomReferenceElement = store.select('anchorElement');
    const currentFloatingElement = store.select('positionerElement');
    const withinComposite =
      contains(currentDomReferenceElement, next) || contains(currentFloatingElement, next);

    // Keep the session if focus moves within the composite (reference <-> floating).
    if (withinComposite) {
      return;
    }

    // End the current typing session when focus leaves the composite entirely.
    timeout.clear();
    stringRef.current = '';
    prevIndexRef.current = matchIndexRef.current;
    onTyping(false);
  };

  useIsoLayoutEffect(
    () => [open(), selectedIndex()] as const,
    ([isOpen, currentSelectedIndex]) => {
      if (!isOpen && currentSelectedIndex !== null) {
        return;
      }

      timeout.clear();
      matchIndexRef.current = null;

      if (stringRef.current !== '') {
        stringRef.current = '';
        onTyping(false);
      }
    },
  );

  const sharedProps: HTMLProps = { onKeyDown, onBlur };

  const elementProps = createMemo<HTMLProps>(() =>
    enabled() ? sharedProps : (EMPTY_OBJECT as HTMLProps),
  );

  return { reference: elementProps, floating: elementProps };
}
