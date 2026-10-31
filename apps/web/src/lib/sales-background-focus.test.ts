import { expect, it, vi } from "vitest";
import { shouldFocusSalesBackground } from "./sales-background-focus";
const context = {
  blocked: false,
  defaultPrevented: false,
  button: 0,
  detail: 1,
  selection: false,
};
it("focuses the scanner after a background click", () => {
  expect(shouldFocusSalesBackground({ closest: () => null }, context)).toBe(
    true,
  );
});
it("protects interactive controls and their nested icons or labels", () => {
  const closest = vi.fn().mockReturnValue({});
  expect(shouldFocusSalesBackground({ closest }, context)).toBe(false);
  for (const selector of [
    "input",
    "button",
    "label",
    "select",
    "dialog",
    "[tabindex]",
    '[role="combobox"]',
  ]) {
    expect(closest.mock.calls[0]?.[0]).toContain(selector);
  }
});
it("does not steal focus from modals, submission, keyboard or text selection", () => {
  for (const patch of [
    { blocked: true },
    { defaultPrevented: true },
    { button: 2 },
    { detail: 0 },
    { selection: true },
  ]) {
    expect(
      shouldFocusSalesBackground(
        { closest: () => null },
        { ...context, ...patch },
      ),
    ).toBe(false);
  }
  expect(shouldFocusSalesBackground(null, context)).toBe(false);
});
