import { expect, it } from "vitest";
import { barcodeLookupDelay } from "./barcode-lookup-delay";

it("starts every valid barcode lookup without an artificial delay", () => {
  expect(barcodeLookupDelay("scanner")).toBe(0);
  expect(barcodeLookupDelay("submit")).toBe(0);
  expect(barcodeLookupDelay("typing")).toBe(0);
});
