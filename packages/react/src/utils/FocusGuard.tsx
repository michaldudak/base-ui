'use client';
import * as React from 'react';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import { platform } from '@base-ui/utils/platform';
import { visuallyHidden } from '@base-ui/utils/visuallyHidden';

/**
 * @internal
 */
export const FocusGuard = React.forwardRef(function FocusGuard(
  props: React.ComponentPropsWithoutRef<'span'>,
  ref: React.ForwardedRef<HTMLSpanElement>,
) {
  const { tabIndex = 0, ...otherProps } = props;
  const [voiceOverRole, setVoiceOverRole] = React.useState<'button' | undefined>();

  useIsoLayoutEffect(() => {
    // Unlike NVDA and JAWS, VoiceOver's virtual cursor triggers `onFocus` as
    // it moves — but only on focusable/role-button elements through WebKit's
    // NSAccessibility path. Setting `role="button"` lets the focus trap catch
    // the cursor.
    if (platform.screenReader.voiceOver && platform.engine.webkit) {
      setVoiceOverRole('button');
    }
  }, []);

  // The role costs the guard its `aria-hidden`, which is only worth paying while the guard is a
  // live trap the VoiceOver cursor should be able to reach. A guard that has left sequential
  // navigation is not one, so it goes back to being hidden rather than lingering in the
  // accessibility tree as an unlabeled button — a popup animating out keeps its guards connected.
  const role = tabIndex >= 0 ? voiceOverRole : undefined;

  return (
    <span
      {...otherProps}
      ref={ref}
      style={visuallyHidden}
      aria-hidden={role ? undefined : true}
      tabIndex={tabIndex}
      // Role is only for VoiceOver
      role={role}
      data-base-ui-focus-guard=""
    />
  );
});
