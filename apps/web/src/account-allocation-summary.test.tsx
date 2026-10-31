import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountAllocationSummary } from "./account-allocation-summary";
it("shows payment destination, partial status and remaining debt", () => {
  const html = renderToStaticMarkup(
    <AccountAllocationSummary
      rows={[
        {
          saleId: "abc",
          pending: 1500000,
          applied: 1000000,
          remaining: 500000,
        },
      ]}
    />,
  );
  expect(html).toContain("Venta ABC");
  expect(html).toContain("Cobro parcial");
  expect(html).toContain("10.000,00");
  expect(html).toContain("5.000,00");
  expect(html).not.toContain("Pendiente actual");
  expect(html).not.toContain("No modifica el precio");
});
it("does not add information for complete payments or empty selections", () => {
  expect(renderToStaticMarkup(<AccountAllocationSummary rows={[]} />)).toBe("");
  expect(
    renderToStaticMarkup(
      <AccountAllocationSummary
        rows={[{ saleId: "full", pending: 1000, applied: 1000, remaining: 0 }]}
      />,
    ),
  ).toBe("");
});
it("only shows partially paid sales in a mixed selection", () => {
  const html = renderToStaticMarkup(
    <AccountAllocationSummary
      rows={[
        { saleId: "full", pending: 1000, applied: 1000, remaining: 0 },
        { saleId: "partial", pending: 1000, applied: 500, remaining: 500 },
      ]}
    />,
  );
  expect(html).not.toContain("Venta FULL");
  expect(html).toContain("Venta PARTIAL");
});
