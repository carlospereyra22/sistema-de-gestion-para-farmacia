import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CashPendingCollections } from "./cash-pending-collections";

it("uses a floating searchable destination in one dialog, retaining the draft while refreshing", () => {
  const source = readFileSync(
    new URL("./cash-pending-collections.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain("Asignar caja…");
  expect(source.match(/<CashDialog\b/g)).toHaveLength(1);
  expect(source).toContain("floatingOptions");
  expect(source).toContain("loading && !loaded");
  expect(source).toContain("SearchableSaleSelect");
  expect(source).not.toContain("inlineOptions");
});

it("keeps the closure actions column compact and right aligned with a centered title", () => {
  const source = readFileSync(
    new URL("./cash-history.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain("w-px whitespace-nowrap px-2 py-3 text-center");
  expect(source).toContain(
    "flex items-center justify-end gap-2 whitespace-nowrap",
  );
});

it("no muestra nada hasta que se abre desde la barra de estado", () => {
  expect(
    renderToStaticMarkup(
      <CashPendingCollections
        token="test"
        organizationId="org"
        branchId="branch"
        registers={[]}
        canManage
        registerId="caja"
        open={false}
        onClose={() => {}}
        onAssigned={() => {}}
      />,
    ),
  ).toBe("");
});

it("marca la factura en espera y avisa que se emite al incorporar el cobro", () => {
  const texto = (archivo: string) =>
    readFileSync(new URL(archivo, import.meta.url), "utf8").replace(
      /\s+/g,
      " ",
    );
  const lista = texto("./cash-pending-collections.tsx");
  expect(lista).toContain("Factura en espera");
  expect(lista).toContain("La factura de la venta se está enviando a ARCA.");
  expect(texto("./cash-pending-confirmation.tsx")).toContain(
    "Al incorporar el cobro se emite la factura C en ARCA, con la fecha de hoy.",
  );
});
