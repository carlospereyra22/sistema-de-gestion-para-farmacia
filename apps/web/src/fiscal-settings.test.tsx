import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceDesignPreview } from "./fiscal-settings";
import { SaleDocumentChoice } from "./sale-document-choice";

describe("fiscal first stage", () => {
  it("marks the thermal mock as non fiscal and never invents authorization", () => {
    const html = renderToStaticMarkup(
      <InvoiceDesignPreview
        profile={{
          legalName: "<Comercio>",
          cuit: "",
          vatCondition: "",
          address: "",
          city: "",
          province: "",
          postalCode: "",
          grossIncomeId: "",
          activityStart: "",
        }}
      />,
    );
    expect(html).toContain("SIN VALIDEZ FISCAL");
    expect(html).toContain("NO ES UNA FACTURA");
    expect(html).toContain("CAE: NO EMITIDO");
    expect(html).toContain("&lt;Comercio&gt;");
    expect(html).toContain("80 mm");
  });
  it.each(["INTERNAL", "INVOICE"] as const)(
    "keeps both modes compact without expanding warnings: %s",
    (value) => {
      const html = renderToStaticMarkup(
        <SaleDocumentChoice
          value={value}
          onChange={() => {}}
          disabled={false}
        />,
      );
      expect(html).toContain("Ticket</button>");
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain("Factura</button>");
      expect(html).not.toContain('type="checkbox"');
      expect(html).not.toContain('role="status"');
    },
  );
});
