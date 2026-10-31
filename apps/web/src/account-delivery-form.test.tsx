import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountDeliveryForm } from "./account-delivery-form";
import { AccountPaymentSummary } from "./account-payment-summary";

it("makes preparing distinct from confirming payment, without a nested form", () => {
  const html = renderToStaticMarkup(
    <AccountDeliveryForm
      data={{
        balanceMinor: "24000000",
        items: [],
        mixedSales: [],
        unassignedReceipts: [],
      }}
      replacesSelection
      onPrepared={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(html).toContain("Importe recibido");
  expect(html).toContain("<dialog");
  expect(html).toContain("Cobro parcial");
  expect(html).toContain("Continuar");
  expect(html).not.toContain("Este cobro se aplica a");
  expect(html).toContain("todavía no se cobra");
  expect(html).toContain("Reemplaza la selección actual");
  expect(html).not.toContain("<form");
  expect(html).not.toContain('type="submit"');
});
it("previews the 60k remainder of a 180k payment on a 240k debt", () => {
  const html = renderToStaticMarkup(
    <AccountPaymentSummary
      balanceMinor="24000000"
      amountMinor={18000000}
      valid
    />,
  );
  expect(html).toContain("240.000,00");
  expect(html).toContain("60.000,00");
  expect(html).toContain("Queda pendiente");
});
it("does not display a misleading remainder when the proposal is incomplete or invalid", () => {
  for (const amount of [NaN, 0, 25000000])
    expect(
      renderToStaticMarkup(
        <AccountPaymentSummary
          balanceMinor="24000000"
          amountMinor={amount}
          valid
        />,
      ),
    ).toContain("—");
  expect(
    renderToStaticMarkup(
      <AccountPaymentSummary
        balanceMinor="24000000"
        amountMinor={18000000}
        valid={false}
      />,
    ),
  ).not.toContain("60.000,00");
});
