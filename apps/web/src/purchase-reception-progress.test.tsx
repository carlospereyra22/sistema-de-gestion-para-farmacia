import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Purchase } from "./lib/api";
import { PurchaseReceptionProgress } from "./purchase-reception-progress";

const purchase: Purchase = {
  id: "p",
  createdAt: "2026-10-20",
  supplierId: "s",
  status: "PARTIALLY_RECEIVED",
  items: [
    {
      id: "i",
      productId: "product",
      orderedQuantity: 200,
      receivedQuantity: 100,
      unitCostMinor: "70000",
    },
  ],
};
it("shows partial quantities and progress without opening the purchase", () => {
  const html = renderToStaticMarkup(
    <PurchaseReceptionProgress purchase={purchase} />,
  );
  expect(html).toContain("100 un. pendientes");
  expect(html).toContain('aria-valuenow="100"');
  expect(html).toContain('aria-valuemax="200"');
  expect(html).toContain("width:50%");
});
it("does not count closed balance as received stock", () => {
  const html = renderToStaticMarkup(
    <PurchaseReceptionProgress
      purchase={{
        ...purchase,
        status: "CANCELLED",
        closedAt: "2026-10-20",
        items: [{ ...purchase.items[0]!, cancelledQuantity: 100 }],
      }}
    />,
  );
  expect(html).toContain("100 un. no entregadas");
  expect(html).toContain("Saldo cerrado");
  expect(html).toContain("width:50%");
  expect(html).not.toContain("un. pendientes");
});
it("shows a complete reception", () => {
  const html = renderToStaticMarkup(
    <PurchaseReceptionProgress
      purchase={{
        ...purchase,
        status: "RECEIVED",
        items: [{ ...purchase.items[0]!, receivedQuantity: 200 }],
      }}
    />,
  );
  expect(html).toContain("width:100%");
  expect(html).toContain("Sin unidades pendientes");
});
