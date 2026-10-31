import { expect, it } from "vitest";
import { canDismissProductBackdrop } from "./product-backdrop";
it("closes only a click starting and ending on the backdrop", () => {
  expect(canDismissProductBackdrop(true, true, false)).toBe(true);
  expect(canDismissProductBackdrop(false, true, false)).toBe(false);
  expect(canDismissProductBackdrop(true, false, false)).toBe(false);
  expect(canDismissProductBackdrop(false, false, false)).toBe(false);
});
it("does not dismiss during a save, image processing or nested modal", () => {
  expect(canDismissProductBackdrop(true, true, true)).toBe(false);
});
