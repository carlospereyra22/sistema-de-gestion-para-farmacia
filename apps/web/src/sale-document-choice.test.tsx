import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SaleDocumentChoice } from "./sale-document-choice";
import { defaultSaleFiscalOptions } from "./lib/sale-fiscal-options";

it("offers a separate accessible settings button without pretending production is enabled", () => {
  const onChange = vi.fn();
  const onConfigure = vi.fn();
  const html = renderToStaticMarkup(
    <SaleDocumentChoice
      value="INVOICE"
      disabled={false}
      onChange={onChange}
      onConfigure={onConfigure}
      summary="Consumidor final · Factura C"
    />,
  );
  expect(html).toContain('aria-label="Configuración de facturación"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html.match(/<button/g)).toHaveLength(3);
  expect(html).toContain("Factura</button>");
  expect(html).not.toContain("Factura · prueba");
  expect(html).toContain("Homologación · Sin validez fiscal");
  expect(html).toContain("Consumidor final · Factura C");
  expect(onChange).not.toHaveBeenCalled();
  expect(onConfigure).not.toHaveBeenCalled();
});
it("locks all three actions while submitting", () => {
  const html = renderToStaticMarkup(
    <SaleDocumentChoice
      value="INVOICE"
      disabled
      onChange={vi.fn()}
      onConfigure={vi.fn()}
    />,
  );
  expect(html.match(/disabled=""/g)).toHaveLength(3);
});
it("disables only invoicing when configuration is missing, keeping settings accessible", () => {
  const html = renderToStaticMarkup(
    <SaleDocumentChoice
      value="INTERNAL"
      disabled={false}
      invoiceDisabled
      unavailableReason="Falta certificado"
      onChange={vi.fn()}
      onConfigure={vi.fn()}
    />,
  );
  expect(html.match(/disabled=""/g)).toHaveLength(1);
  expect(html).toContain("text-slate-400");
  expect(html).toContain("Falta certificado");
  expect(html).toContain("Factura</button>");
});
it("does not label a production invoice as a test", () => {
  const html = renderToStaticMarkup(
    <SaleDocumentChoice
      value="INVOICE"
      disabled={false}
      environment="PRODUCTION"
      onChange={vi.fn()}
    />,
  );
  expect(html).toContain("Factura</button>");
  expect(html).not.toContain("Sin validez fiscal");
});
it("keeps the internal ticket compact and defaults new fiscal options to final consumer", () => {
  const html = renderToStaticMarkup(
    <SaleDocumentChoice
      value="INTERNAL"
      disabled={false}
      onChange={vi.fn()}
      summary="Consumidor final · Factura C"
    />,
  );
  expect(html).not.toContain("Consumidor final · Factura C");
  expect(html).toContain("Ticket</button>");
  expect(html).not.toContain("Ticket interno");
  expect(defaultSaleFiscalOptions).toEqual({
    recipient: "FINAL_CONSUMER",
    voucherType: 11,
  });
});
