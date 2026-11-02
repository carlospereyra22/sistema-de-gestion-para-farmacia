import { describe, expect, it } from "vitest";
import { salesShortcut } from "./sales-shortcuts";

const key = {
  key: "+",
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  repeat: false,
  defaultPrevented: false,
};
const context = { editing: false, blocked: false, checkoutOpen: false };
const ctrlEnter = { ...key, key: "Enter", ctrlKey: true };

describe("sales shortcuts", () => {
  it("adjusts the last line with + and - outside inputs", () => {
    expect(salesShortcut(key, context)).toEqual({
      action: "increment-last-line",
    });
    expect(salesShortcut({ ...key, key: "-" }, context)).toEqual({
      action: "decrement-last-line",
    });
  });
  it("leaves + and - to editable fields", () => {
    expect(salesShortcut(key, { ...context, editing: true })).toBeUndefined();
  });
  it("opens or confirms checkout with Ctrl + Enter, even from a field", () => {
    expect(salesShortcut(ctrlEnter, context)).toEqual({ action: "checkout" });
    expect(salesShortcut(ctrlEnter, { ...context, editing: true })).toEqual({
      action: "checkout",
    });
    expect(
      salesShortcut(ctrlEnter, { ...context, checkoutOpen: true }),
    ).toEqual({ action: "checkout" });
  });
  it.each([
    ["1", "CASH"],
    ["2", "CARD"],
    ["3", "TRANSFER"],
    ["4", "ACCOUNT"],
  ] as const)("chooses payment method %s inside checkout", (value, method) => {
    expect(
      salesShortcut({ ...key, key: value }, { ...context, checkoutOpen: true }),
    ).toEqual({ action: "payment-method", method });
  });
  it("keeps digits for the barcode search outside checkout", () => {
    expect(salesShortcut({ ...key, key: "1" }, context)).toBeUndefined();
  });
  it("keeps digits for the received amount field", () => {
    expect(
      salesShortcut(
        { ...key, key: "1" },
        { ...context, checkoutOpen: true, editing: true },
      ),
    ).toBeUndefined();
  });
  it("does not adjust lines while checkout is open", () => {
    expect(
      salesShortcut(key, { ...context, checkoutOpen: true }),
    ).toBeUndefined();
  });
  it("does nothing while blocked", () => {
    expect(salesShortcut(ctrlEnter, { ...context, blocked: true })).toBe(
      undefined,
    );
  });
  it.each([
    "altKey",
    "metaKey",
    "isComposing",
    "repeat",
    "defaultPrevented",
  ] as const)("preserves %s", (flag) => {
    expect(salesShortcut({ ...key, [flag]: true }, context)).toBeUndefined();
    expect(
      salesShortcut({ ...ctrlEnter, [flag]: true }, context),
    ).toBeUndefined();
  });
  it("ignores other Ctrl combinations", () => {
    expect(
      salesShortcut({ ...key, key: "s", ctrlKey: true }, context),
    ).toBeUndefined();
    expect(
      salesShortcut({ ...ctrlEnter, shiftKey: true }, context),
    ).toBeUndefined();
  });
});
