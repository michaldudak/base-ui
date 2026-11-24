import { createSignal, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useControlled } from '#utils/useControlled';
import { useMenuFilterImpl } from '../filter-root/MenuFilterContext';
import { MenuRadioGroupContext } from './MenuRadioGroupContext';
import { MenuGroupContext } from '../group/MenuGroupContext';
import { useRenderElement } from '../../internals/useRenderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { MenuRoot } from '../root/MenuRoot';

/**
 * @internal
 */
export function MenuRadioGroupPlain(componentProps: MenuRadioGroup.Props): JSX.Element {
  const elementProps = omit(
    componentProps,
    'render',
    'class',
    'value',
    'defaultValue',
    'onValueChange',
    'disabled',
    'style',
    'aria-labelledby',
  );

  const disabled = () => componentProps.disabled ?? false;

  const [labelId, setLabelId] = createSignal<string | undefined>(undefined, { ownedWrite: true });

  const [value, setValueUnwrapped] = useControlled({
    controlled: () => componentProps.value,
    default: () => componentProps.defaultValue,
    name: 'MenuRadioGroup',
  });

  const setValue = (newValue: any, eventDetails: MenuRadioGroup.ChangeEventDetails) => {
    componentProps.onValueChange?.(newValue, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    setValueUnwrapped(newValue);
  };

  const state: MenuRadioGroupState = {
    get disabled() {
      return disabled();
    },
  };

  const context: MenuRadioGroupContext = {
    value,
    setValue,
    disabled,
  };

  return (
    <MenuGroupContext value={setLabelId}>
      <MenuRadioGroupContext value={context}>
        {useRenderElement('div', componentProps, {
          state,
          props: () => [
            {
              role: 'group',
              'aria-labelledby': componentProps['aria-labelledby'] ?? labelId(),
              'aria-disabled': disabled() || undefined,
            },
            elementProps,
          ],
        })}
      </MenuRadioGroupContext>
    </MenuGroupContext>
  );
}

/**
 * Groups related radio items.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuRadioGroup<Value = any>(props: MenuRadioGroup.Props<Value>): JSX.Element {
  const RadioGroup = useMenuFilterImpl()?.RadioGroup ?? MenuRadioGroupPlain;
  return <RadioGroup {...props} />;
}

export interface MenuRadioGroupProps<Value = any> extends BaseUIComponentProps<
  'div',
  MenuRadioGroupState
> {
  /**
   * The content of the component.
   */
  children?: JSX.Element | undefined;
  /**
   * The controlled value of the radio item that should be currently selected.
   *
   * To render an uncontrolled radio group, use the `defaultValue` prop instead.
   */
  value?: Value | undefined;
  /**
   * The uncontrolled value of the radio item that should be initially selected.
   *
   * To render a controlled radio group, use the `value` prop instead.
   */
  defaultValue?: Value | undefined;
  /**
   * Function called when the selected value changes.
   */
  onValueChange?:
    ((value: Value, eventDetails: MenuRadioGroup.ChangeEventDetails) => void) | undefined;
  /**
   * Whether the component should ignore user interaction.
   *
   * @default false
   */
  disabled?: boolean | undefined;
}

export interface MenuRadioGroupState {
  /**
   * Whether the component is disabled.
   */
  disabled: boolean;
}

export type MenuRadioGroupChangeEventReason = MenuRoot.ChangeEventReason;
export type MenuRadioGroupChangeEventDetails = MenuRoot.ChangeEventDetails;

export namespace MenuRadioGroup {
  export type Props<Value = any> = MenuRadioGroupProps<Value>;
  export type State = MenuRadioGroupState;
  export type ChangeEventReason = MenuRadioGroupChangeEventReason;
  export type ChangeEventDetails = MenuRadioGroupChangeEventDetails;
}
