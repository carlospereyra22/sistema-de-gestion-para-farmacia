import { expect, it } from "vitest";
import { historyPages } from "./history-pagination";
it("shows edges and nearby pages without a long list", () => {
  expect(historyPages(1, 15)).toEqual([1, 2, "gap-15", 15]);
  expect(historyPages(8, 15)).toEqual([1, "gap-7", 7, 8, 9, "gap-15", 15]);
  expect(historyPages(1, 1)).toEqual([1]);
  expect(historyPages(15, 15)).toEqual([1, "gap-14", 14, 15]);
});
