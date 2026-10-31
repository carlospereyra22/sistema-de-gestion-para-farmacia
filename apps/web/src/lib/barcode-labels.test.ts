import { expect, it } from "vitest";
import { barcodeLabelsHtml, internalBarcodeSvg } from "./barcode-labels";
it("draws an actual Code 128 symbol with quiet zones", () => {
  const svg = internalBarcodeSvg("SG123456789012");
  expect(svg).toContain('<rect x="20"');
  expect(svg).toContain('aria-label="SG123456789012"');
  expect(svg.match(/fill="black"/g)!.length).toBeGreaterThan(30);
  expect(() => internalBarcodeSvg("<script>")).toThrow();
});
it("prints only the requested number of labels on A4 with 21 per page", () => {
  const html = barcodeLabelsHtml("Actron 400", "Blíster", "SG123456789012", 22);
  expect(html.match(/<article>/g)).toHaveLength(22);
  expect(html.match(/<section>/g)).toHaveLength(2);
  expect(html).toContain("size:A4 portrait");
  expect(html).toContain("Blíster");
  expect(html).not.toContain('class="ticket"');
});
it("escapes product text and validates the copy count", () => {
  const html = barcodeLabelsHtml(
    '<img src=x onerror="alert(1)">',
    "Caja",
    "SG123456789012",
    1,
  );
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img");
  for (const count of [0, 211, 1.5, NaN])
    expect(() =>
      barcodeLabelsHtml("A", "Caja", "SG123456789012", count),
    ).toThrow();
});
