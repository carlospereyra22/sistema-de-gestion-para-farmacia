import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SaleCheckoutDialog } from "./sale-checkout-dialog";

type Props = Parameters<typeof SaleCheckoutDialog>[0];
const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    <SaleCheckoutDialog
      summary="3 productos · 4 unidades · Público general · Precio general"
      subtotalMinor={1_707_000}
      discountMinor={0}
      totalMinor={1_707_000}
      paidMinor={0}
      payments={[]}
      method="CASH"
      accountEnabled={false}
      amount="20.000"
      receivedMinor={2_000_000}
      documentChoice={<span>Ticket</span>}
      submitting={false}
      confirmDisabled={false}
      onMethod={() => {}}
      onAmount={() => {}}
      onRemovePayment={() => {}}
      onSplit={() => {}}
      onConfirm={() => {}}
      onClose={() => {}}
      {...props}
    />,
  );

it("renders an accessible modal with payment methods and shortcuts", () => {
  const html = render();
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain("Cobrar venta");
  for (const label of [
    "Efectivo",
    "Tarjeta",
    "Transferencia",
    "Cuenta corriente",
  ])
    expect(html).toContain(label);
  expect(html).toContain('aria-checked="true"');
  expect(html).toContain("Confirmar venta");
});

it("shows quick cash amounts and the change to deliver", () => {
  const html = render();
  expect(html).toContain('aria-label="Montos rápidos"');
  expect(html).toContain("Exacto");
  expect(html).toContain('placeholder="0,00"');
  expect(html).toContain(",00</span>");
  expect(html).toContain("Vuelto a entregar");
  expect(html).toContain('aria-live="polite"');
  expect(html).toMatch(/2\.930,00/);
});

it("only enables cuenta corriente for an enabled customer", () => {
  expect(render()).toContain(
    "Cuenta corriente: elegí un cliente con cuenta habilitada.",
  );
  expect(render({ accountEnabled: true })).not.toContain(
    "elegí un cliente con cuenta habilitada",
  );
});

it("shows partial payments, the remaining balance and the split link", () => {
  const html = render({
    paidMinor: 1_000_000,
    payments: [{ method: "CARD", amountMinor: 1_000_000 }],
    amount: "5.000",
    receivedMinor: 500_000,
  });
  expect(html).toContain("Pagado");
  expect(html).toContain("Resta");
  expect(html).toContain('aria-label="Quitar pago en Tarjeta"');
  expect(html).toContain("¿Con qué medio se completa?");
  // Ofrece los otros medios, sin el actual ni cuenta corriente deshabilitada.
  const choices = html.slice(html.indexOf("¿Con qué medio"));
  expect(choices).toContain("Tarjeta");
  expect(choices).toContain("Transferencia");
  expect(choices).not.toContain(">Cuenta corriente<");
});

it("keeps errors inside the window and offers a retry", () => {
  const html = render({ errorMessage: "No se pudo completar la venta." });
  expect(html).toContain('role="alert"');
  expect(html).toContain("Reintentar");
});
