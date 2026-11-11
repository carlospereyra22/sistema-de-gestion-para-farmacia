import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ThermalTicket } from "@gestion/contracts";
import { SaleConfirmedDialog } from "./sale-confirmed-dialog";

const render = (
  payments: Parameters<typeof SaleConfirmedDialog>[0]["payments"],
  aviso?: string,
) =>
  renderToStaticMarkup(
    <SaleConfirmedDialog
      saleId="f1c2a6dd-0000-4000-8000-000000000000"
      totalMinor={279_200}
      customerName="Público general"
      payments={payments}
      aviso={aviso}
      loadTicket={() => new Promise<ThermalTicket>(() => {})}
      onPrint={() => {}}
      onViewSale={() => {}}
      onNewSale={() => {}}
    />,
  );

it("confirms the sale with close, actions and a preview on demand", () => {
  const html = render([{ method: "CARD", amountMinor: 279_200 }]);
  expect(html).toContain('aria-labelledby="sale-confirmed-title"');
  expect(html).toContain('aria-label="Cerrar"');
  expect(html).toContain("Venta confirmada");
  expect(html).toContain("Tarjeta");
  expect(html).toContain("Público general");
  expect(html).toContain("Código interno");
  expect(html).toContain("F1C2A6DD");
  // Imprimir es la acción principal (Enter); Nueva venta queda en Esc.
  expect(html).toMatch(/bg-teal-700[^"]*"[^>]*>.*Imprimir ticket.*Enter/);
  expect(html).toMatch(/Nueva venta<kbd[^>]*>Esc</);
  expect(html).toContain("Ver ventas");
  // La vista previa no se muestra ni se carga hasta pedirla.
  expect(html).toContain('aria-pressed="false"');
  expect(html).toContain("Vista previa");
  expect(html).not.toContain('aria-label="Vista previa del ticket"');
  expect(html).not.toContain("Vuelto a entregar");
});

it("shows the change to deliver when cash exceeded the total", () => {
  const html = render([
    { method: "CARD", amountMinor: 79_200 },
    { method: "CASH", amountMinor: 500_000 },
  ]);
  expect(html).toContain("Tarjeta + Efectivo");
  expect(html).toContain("Vuelto a entregar");
  expect(html).toMatch(/3\.000,00/);
  expect(html).toMatch(/Recibido \$\s5\.000,00 en efectivo/);
});

it("avisa que la factura sale al volver internet en una venta sin conexión", () => {
  const html = render(
    [{ method: "CASH", amountMinor: 279_200 }],
    "Sin conexión: la factura C se emite sola en ARCA cuando vuelva internet.",
  );
  expect(html).toContain('role="status"');
  expect(html).toContain("se emite sola en ARCA");
  expect(render([{ method: "CASH", amountMinor: 1 }])).not.toContain(
    'role="status"',
  );
});
