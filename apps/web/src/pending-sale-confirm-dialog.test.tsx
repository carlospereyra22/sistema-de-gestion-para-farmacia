import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PendingSaleConfirmDialog } from "./pending-sale-confirm-dialog";

it("identifica el destino y deja claro que la venta se descartará", () => {
  const html = renderToStaticMarkup(
    <PendingSaleConfirmDialog
      action="branch"
      currentBranch="Casa Central"
      nextBranch="Prueba"
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />,
  );
  expect(html).toContain("¿Cambiar de sucursal?");
  expect(html).toContain("Casa Central");
  expect(html).toContain("Prueba");
  expect(html).toContain("Descartar y cambiar");
  expect(html).toContain("Seguir con la venta");
});
