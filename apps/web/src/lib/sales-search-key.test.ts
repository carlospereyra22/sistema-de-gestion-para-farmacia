import { describe, expect, it } from "vitest";
import { shouldRouteSalesSearchKey } from "./sales-search-key";

const key = {
  key: "7",
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  repeat: false,
  defaultPrevented: false,
};
const context = { editing: false, blocked: false };
describe("sales scan routing", () => {
  it("routes the first barcode character from buttons or the page", () => {
    expect(shouldRouteSalesSearchKey(key, context)).toBe(true);
  });
  it("leaves amount, discount, search and other editable fields alone", () => {
    expect(shouldRouteSalesSearchKey(key, { ...context, editing: true })).toBe(
      false,
    );
  });
  it("does not route while a modal, history or submission is active", () => {
    expect(shouldRouteSalesSearchKey(key, { ...context, blocked: true })).toBe(
      false,
    );
  });
  it.each(["Enter", " ", "Tab", "Escape", "ArrowDown"])(
    "preserves button and keyboard actions: %s",
    (value) => {
      expect(shouldRouteSalesSearchKey({ ...key, key: value }, context)).toBe(
        false,
      );
    },
  );
  it.each([
    "ctrlKey",
    "altKey",
    "metaKey",
    "isComposing",
    "repeat",
    "defaultPrevented",
  ] as const)("preserves %s", (flag) => {
    expect(shouldRouteSalesSearchKey({ ...key, [flag]: true }, context)).toBe(
      false,
    );
  });
});
