import { expect, it } from "vitest";
import { scrollSaleIntoView } from "./scroll-sale-into-view";
const rect = (top: number) => ({
  top,
  bottom: top + 100,
  left: 0,
  right: 100,
  width: 100,
  height: 100,
  x: 0,
  y: top,
  toJSON: () => ({}),
});
it("brings a lower sale to the top of its own scrolling list", () => {
  const container = { scrollTop: 0, getBoundingClientRect: () => rect(200) };
  scrollSaleIntoView(container, { getBoundingClientRect: () => rect(440) });
  expect(container.scrollTop).toBe(240);
});
it("accounts for existing scroll and never requests a negative offset", () => {
  const container = { scrollTop: 100, getBoundingClientRect: () => rect(200) };
  scrollSaleIntoView(container, { getBoundingClientRect: () => rect(260) });
  expect(container.scrollTop).toBe(160);
  scrollSaleIntoView(container, { getBoundingClientRect: () => rect(0) });
  expect(container.scrollTop).toBe(0);
});
