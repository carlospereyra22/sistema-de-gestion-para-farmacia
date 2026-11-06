import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CashOrganizationTable } from "./cash-organization-registers";
import type { CashOrganizationOverview } from "./lib/api";

const data: CashOrganizationOverview = {
  branches: [
    { id: "centro", name: "Casa Central" },
    { id: "norte", name: "Sucursal 2" },
  ],
  registers: [
    {
      id: "a",
      name: "Caja demo",
      active: true,
      responsibleName: "Ana",
      branchId: "centro",
      branchName: "Casa Central",
      session: { openedAt: "2026-11-06T14:00:00Z", openedBy: "Cajero prueba" },
    },
    {
      id: "b",
      name: "test",
      active: true,
      branchId: "norte",
      branchName: "Sucursal 2",
      session: null,
    },
  ],
};
const render = (
  props: Partial<Parameters<typeof CashOrganizationTable>[0]> = {},
) =>
  renderToStaticMarkup(
    <CashOrganizationTable
      data={data}
      failed={false}
      branchId=""
      state=""
      onBranch={() => {}}
      onState={() => {}}
      onRetry={() => {}}
      {...props}
    />,
  );

it("muestra cada caja con su sucursal y quién la abrió", () => {
  const html = render();
  expect(html).toContain("Caja demo");
  expect(html).toContain("Casa Central");
  expect(html).toContain("Cajero prueba");
  expect(html).toContain("Abierta");
  expect(html).toContain("Cerrada");
});
it("respeta el filtro de sucursal", () => {
  const html = render({ branchId: "norte" });
  expect(html).toContain(">test<");
  expect(html).not.toContain("Cajero prueba");
});
it("avisa si los filtros no dejan cajas", () => {
  expect(render({ branchId: "norte", state: "open" })).toContain(
    "No hay cajas con estos filtros.",
  );
});
it("indica la carga y ofrece reintentar si falla", () => {
  expect(render({ data: undefined })).toContain("Consultando cajas…");
  expect(render({ data: undefined, failed: true })).toContain("Reintentar");
});
