import { createSignal } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useOnMount } from '#utils/useEffect';
import { platform } from '#utils/platform';
import { visuallyHidden } from '#utils/visuallyHidden';
import type { HTMLProps } from '../../../internals/types';

/**
 * @internal
 */
export function FocusGuard(props: HTMLProps<HTMLSpanElement>): JSX.Element {
  const [role, setRole] = createSignal<'button' | undefined>(undefined, { ownedWrite: true });

  useOnMount(() => {
    // Unlike NVDA and JAWS, VoiceOver's virtual cursor triggers `onFocus` as
    // it moves — but only on focusable/role-button elements through WebKit's
    // NSAccessibility path. Setting `role="button"` lets the focus trap catch
    // the cursor.
    if (platform.screenReader.voiceOver && platform.engine.webkit) {
      setRole('button');
    }
  });

  return (
    <span
      {...props}
      style={visuallyHidden}
      aria-hidden={role() ? undefined : 'true'}
      tabindex={0}
      // Role is only for VoiceOver
      role={role()}
      data-base-ui-focus-guard=""
    />
  );
}
