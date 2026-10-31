const interactive =
  'input, textarea, select, button, a, label, summary, dialog, [role="button"], [role="textbox"], [role="combobox"], [role="spinbutton"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], [tabindex], [contenteditable]:not([contenteditable="false"])';

export function shouldFocusSalesBackground(
  target: Pick<Element, "closest"> | null,
  context: {
    blocked: boolean;
    defaultPrevented: boolean;
    button: number;
    detail: number;
    selection: boolean;
  },
) {
  return (
    !context.blocked &&
    !context.defaultPrevented &&
    context.button === 0 &&
    context.detail > 0 &&
    !context.selection &&
    target !== null &&
    !target.closest(interactive)
  );
}
