import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InvoiceEditor } from "./invoice-editor";
it("opens from a purchase with its amount and supplier term already filled", () => {
  const html = renderToStaticMarkup(
    <InvoiceEditor
      scope={{ token: "test", organizationId: "org", branchId: "branch" }}
      options={{
        today: "2026-10-20",
        canCreate: true,
        suppliers: [
          {
            id: "supplier",
            name: "Ramona",
            accountEnabled: true,
            accountTermDays: 15,
          },
        ],
        purchases: [
          {
            id: "purchase",
            supplierId: "supplier",
            reference: "Ref",
            status: "ORDERED",
            createdAt: "2026-10-20",
            amountMinor: "14400000",
          },
        ],
      }}
      storageKey="test-invoice-editor"
      initialPurchaseId="purchase"
      onClose={() => undefined}
      onSaved={() => undefined}
    />,
  );
  expect(html).toContain('value="144000,00"');
  expect(html).toContain('value="2026-11-04"');
  expect(html).toContain("En cuotas");
  expect(html).toContain("Sin fecha");
});
