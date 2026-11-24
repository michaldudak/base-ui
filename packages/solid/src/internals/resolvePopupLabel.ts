interface PopupLabelProps {
  'aria-label'?: string | false | undefined;
  'aria-labelledby'?: string | false | undefined;
  render?: unknown;
}

/**
 * Solid port: the `render` prop has no element form, so the label comes from the props alone.
 * Call it where the result is used (in a memo or a props function): it reads `props`.
 */
export function resolvePopupLabel(
  props: PopupLabelProps,
  activeTriggerElement: Element | null,
  activeTriggerId: string | null,
) {
  const ariaLabel = props['aria-label'];
  // `false` (Solid's way to remove an attribute) counts as not set.
  const ariaLabelledByProp = props['aria-labelledby'];
  let ariaLabelledBy = ariaLabelledByProp === false ? undefined : ariaLabelledByProp;

  if (ariaLabelledBy == null && !ariaLabel) {
    // Prefer the element's live id: a `render` element's own id wins over the registered one.
    ariaLabelledBy = activeTriggerElement
      ? activeTriggerElement.id || undefined
      : activeTriggerId || undefined;
  }

  return ariaLabelledBy;
}
