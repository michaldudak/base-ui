import { createSignal, omit, onCleanup } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { platform } from '#utils/platform';
import { useIsoLayoutEffect } from '#utils/useEffect';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import {
  useFilterDropdownItemContext,
  useFilterDropdownRootContext,
  useFilterDropdownValueContext,
} from '../root/FilterDropdownRootContext';
import { refocusOwner, isRefocusingOwner } from '../utils/refocusOwner';

/**
 * @internal
 */
export function FilterDropdownInput(componentProps: FilterDropdownInputHostProps): JSX.Element {
  const elementProps = omit(
    componentProps,
    'render',
    'class',
    'style',
    'id',
    'disabled',
    'activeItemId',
    'navigationProps',
    'hostProps',
  );

  // Browsers flag a form field with neither an id nor a name.
  const id = useBaseUiId(() => {
    // Solid port: `false` (Solid's way to remove an attribute) counts as not set.
    const idProp = componentProps.id;
    return idProp === false ? undefined : idProp;
  });

  const context = useFilterDropdownRootContext();
  const { listRef } = useFilterDropdownItemContext();
  const value = useFilterDropdownValueContext();

  // IME text isn't committed until the composition ends, so filtering waits for it.
  const [composingValue, setComposingValue] = createSignal<string | null>(null, {
    ownedWrite: true,
  });
  const isComposingRef = { current: false };

  let inputElement: HTMLInputElement | null = null;
  const setInputElement = (element: HTMLInputElement) => {
    inputElement = element;
    context.focusOwnerRef.current = element;
  };
  onCleanup(() => {
    if (context.focusOwnerRef.current === inputElement) {
      context.focusOwnerRef.current = null;
    }
    inputElement = null;
  });

  // Solid port: inputs aren't strictly controlled. React re-renders a controlled input after
  // every edit, which puts back the committed value when the edit was rejected (a controlled
  // consumer that ignores it, or an edit made while the popup closes). Each edit bumps this
  // signal, so the effect below writes the committed value back when it differs from the DOM.
  const [editVersion, setEditVersion] = createSignal(0, { ownedWrite: true });
  const displayValue = () => composingValue() ?? value();
  useIsoLayoutEffect(
    () => [displayValue(), editVersion()] as const,
    ([currentDisplayValue]) => {
      if (inputElement !== null && inputElement.value !== currentDisplayValue) {
        inputElement.value = currentDisplayValue;
      }
    },
  );

  function commitValue(nextValue: string, nativeEvent: Event) {
    // The input keeps focus until the popup unmounts. The query is held in place while it
    // animates out, so an edit made then would change the committed value behind it.
    if (!context.open()) {
      return;
    }
    const reason = nextValue === '' ? REASONS.inputClear : REASONS.inputChange;
    context.onValueChange(nextValue, createChangeEventDetails(reason, nativeEvent));
  }

  const state: FilterDropdownInputState = {
    get highlighted() {
      return (
        context.inputFocusVisible() &&
        (!context.keyboardModality() || componentProps.activeItemId == null)
      );
    },
  };

  const ownProps: HTMLProps = {
    type: 'text',
    role: 'searchbox',
    inputmode: 'search',
    autocomplete: 'off',
    spellcheck: 'false',
    autocorrect: 'off',
    autocapitalize: 'none',
    // The aria-autocomplete 'list' value is only valid with `aria-haspopup` so we depend
    // on the searchbox role to communicate affordance, with an input label as fallback
    // https://w3c.github.io/aria/#aria-autocomplete
    'aria-autocomplete': undefined,
    onCompositionStart(event: CompositionEvent & { currentTarget: HTMLInputElement }) {
      // Some Android keyboards treat all typing as one composition.
      if (platform.os.android) {
        return;
      }
      isComposingRef.current = true;
      setComposingValue(event.currentTarget.value);
    },
    onCompositionEnd(event: CompositionEvent & { currentTarget: HTMLInputElement }) {
      if (!isComposingRef.current) {
        return;
      }
      isComposingRef.current = false;
      setComposingValue(null);
      setEditVersion((version) => version + 1);
      commitValue(event.currentTarget.value, event);
    },
    onInput(event: InputEvent & { currentTarget: HTMLInputElement }) {
      setEditVersion((version) => version + 1);
      if (isComposingRef.current) {
        setComposingValue(event.currentTarget.value);
        return;
      }
      commitValue(event.currentTarget.value, event);
    },
    onKeyDown() {
      context.setKeyboardModality(true);
    },
    onPointerDown() {
      context.setKeyboardModality(false);
    },
    onMouseEnter(event: MouseEvent & { currentTarget: HTMLInputElement }) {
      context.setKeyboardModality(false);
      // Take focus so typing filters immediately.
      if (context.open()) {
        refocusOwner(event.currentTarget);
      }
    },
    onFocus(event: FocusEvent) {
      context.setInputFocusVisible(true);

      // A screen reader that followed `aria-activedescendant` put real focus on the item, so
      // focus returning from an item means the user moved back to the input on purpose and
      // the highlight no longer reflects where they are. The list's own key replay and
      // pointer refocus also pass through here and keep it.
      if (context.autoHighlight() === 'always' || isRefocusingOwner()) {
        return;
      }
      const from = event.relatedTarget as HTMLElement | null;
      if (from !== null && listRef.current.includes(from)) {
        context.setActiveIndex(null);
      }
    },
    onBlur() {
      context.setInputFocusVisible(false);
    },
  };

  return useRenderElement('input', componentProps, {
    state,
    ref: setInputElement,
    props: () => [
      componentProps.navigationProps,
      {
        ...ownProps,
        id: id(),
        disabled: context.disabled() || componentProps.disabled,
        'aria-activedescendant': componentProps.activeItemId,
        'aria-controls': context.listId(),
        value: displayValue(),
      },
      componentProps.hostProps,
      elementProps,
    ],
  });
}

export interface FilterDropdownInputState {
  /**
   * Whether the input shows its focus ring.
   * Cleared when keyboard navigation highlights an item.
   */
  highlighted: boolean;
}

export interface FilterDropdownInputProps extends BaseUIComponentProps<
  'input',
  FilterDropdownInputState
> {}

interface FilterDropdownInputHostProps extends FilterDropdownInputProps {
  /**
   * The id of the item the host highlights, which the input points at while it holds focus.
   */
  activeItemId?: string | undefined;
  /**
   * The host's list navigation props. The host routes key presses itself, so these exclude a
   * key handler.
   */
  navigationProps?: HTMLProps | undefined;
  /**
   * Solid port: props the host merges under the consumer's (React merges them into the props it
   * passes, which Solid can't do without reading every prop eagerly).
   */
  hostProps?: HTMLProps | undefined;
}

export namespace FilterDropdownInput {
  export type Props = FilterDropdownInputProps;
  export type State = FilterDropdownInputState;
}
