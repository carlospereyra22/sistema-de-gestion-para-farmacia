import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CashHistory } from "./cash-history";
import type { CashClosure } from "./lib/api";

const closure = (changes: Partial<CashClosure>): CashClosure => ({
  id: "c",
  cashRegisterId: "a",
  cashRegisterName: "Mostrador",
  openedAt: "2026-11-05T12:00:00Z",
  closedAt: "2026-11-05T20:00:00Z",
  openingAmountMinor: "0",
  closingAmountMinor: "10000",
  cashSalesMinor: "0",
  saleChangeMinor: "0",
  cardMinor: "0",
  transferMinor: "0",
  manualInMinor: "0",
  manualOutMinor: "0",
  expectedAmountMinor: "10000",
  differenceMinor: "0",
  movements: [],
  ...changes,
});

const render = (
  props: Partial<Parameters<typeof CashHistory>[0]> = {},
): string =>
  renderToStaticMarkup(
    <CashHistory
      closures={[]}
      registers={[
        { id: "a", name: "Mostrador" },
        { id: "b", name: "Perfumería" },
      ]}
      from="2026-10-07"
      to="2026-11-05"
      registerId=""
      archived={false}
      canArchive
      rangeInvalid={false}
      onFrom={vi.fn()}
      onTo={vi.fn()}
      onRegister={vi.fn()}
      onArchived={vi.fn()}
      onView={vi.fn()}
      actions={() => null}
      {...props}
    />,
  );

it("muestra las fechas que se están aplicando y usa selectores del sistema", () => {
  const html = render();
  expect(html).toContain('value="2026-10-07"');
  expect(html).toContain('value="2026-11-05"');
  expect(html).toContain("Todas las cajas");
  expect(html).toContain("Visibles");
  expect(html).not.toContain("<select");
  expect(html).not.toContain("Ver cierres");
  expect(html).toContain("No hay cierres para el período seleccionado.");
});

it("oculta Estado a quien no puede ver cierres eliminados", () => {
  expect(render({ canArchive: false })).not.toContain("Estado de los cierres");
});

it("distingue faltante, sobrante y sin diferencia", () => {
  const html = render({
    closures: [
      closure({ id: "1", differenceMinor: "-5000" }),
      closure({ id: "2", differenceMinor: "2500" }),
      closure({ id: "3", differenceMinor: "0" }),
    ],
  });
  expect(html).toContain("Faltante");
  expect(html).toContain("is-short");
  expect(html).toContain("Sobrante");
  expect(html).toContain("is-over");
  expect(html).toContain("Sin diferencia");
  expect(html).not.toContain("-$");
});

it("filtra por caja", () => {
  const html = render({
    registerId: "b",
    closures: [
      closure({ id: "1", cashRegisterName: "Mostrador caja" }),
      closure({
        id: "2",
        cashRegisterId: "b",
        cashRegisterName: "Perfumería caja",
      }),
    ],
  });
  expect(html).toContain("Perfumería caja");
  expect(html).not.toContain("Mostrador caja");
});

it("avisa si el rango de fechas es inválido", () => {
  expect(render({ rangeInvalid: true })).toContain(
    "La fecha Desde no puede ser posterior a Hasta.",
  );
});
