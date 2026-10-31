import { expect, it } from "vitest";
import { resolveProductKind } from "./product-kind";
it("preserves manual corrections even when a source or saved record disagrees", () => {
  expect(resolveProductKind("other", true)).toBe(false);
  expect(resolveProductKind("medicine", false, true)).toBe(true);
});
it("uses the saved classification before retailer membership", () => {
  expect(resolveProductKind("auto", true, true)).toBe(true);
  expect(resolveProductKind("auto", false)).toBe(false);
});
it("recognizes exact non-medicinal references and leaves unknown codes unresolved", () => {
  expect(resolveProductKind("auto", undefined, true)).toBe(false);
  expect(resolveProductKind("auto")).toBeUndefined();
});
