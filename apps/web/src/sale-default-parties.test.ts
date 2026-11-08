import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync(
  new URL("./workspace-shell.tsx", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const between = (start: string, end: string) =>
  source.slice(
    source.indexOf(start),
    source.indexOf(end, source.indexOf(start)),
  );

it("vuelve a Público general al terminar, vaciar o descartar la venta", () => {
  expect(between("const limpiarVenta", "};")).toContain("resetSaleParties();");
  expect(
    between("completedSale = await createSale", "await loadHistory();"),
  ).toContain("limpiarVenta();");
  // También al guardar la venta sin conexión.
  expect(between("const cobrarSinConexion", "\n  };")).toContain(
    "limpiarVenta();",
  );
  expect(between("onClear={() => {", "focusProductSearch();")).toContain(
    "resetSaleParties();",
  );
  expect(between("onDiscard={() => {", "setResumeNeeded(false);")).toContain(
    "resetSaleParties();",
  );
});
it("al salir de Ventas solo limpia si no hay una venta en curso", () => {
  expect(source).toContain(
    "if (!posVisible && lines.length === 0) resetSaleParties();",
  );
});
it("limpia el cliente y también la lista de precios", () => {
  const reset = between("const resetSaleParties", "}, []);");
  expect(reset).toContain('setCustomerId("");');
  expect(reset).toContain('setSalePriceListId("");');
});
