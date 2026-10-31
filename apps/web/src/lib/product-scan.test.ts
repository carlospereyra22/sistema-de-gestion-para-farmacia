import { expect, it } from "vitest";
import { isProductScan } from "./product-scan";

it("recognizes scanner bursts without treating prices or normal typing as scans", () => {
  expect(isProductScan("070330731806", 100, 160, 165)).toBe(true);
  expect(isProductScan("7793640992769", 100, 165, 170)).toBe(true);
  expect(isProductScan("7793640992769", 100, 1500, 1505)).toBe(false);
  expect(isProductScan("7793640992769", 100, 165, 500)).toBe(false);
  for (const value of [
    "1500",
    "123.45",
    "Actron 600",
    "77936409927697793640992769",
  ])
    expect(isProductScan(value, 100, 160, 165)).toBe(false);
});

it("leaves checksum validation to the barcode field so invalid scanned codes remain editable", () => {
  expect(isProductScan("7793640992760", 100, 160, 165)).toBe(true);
});
