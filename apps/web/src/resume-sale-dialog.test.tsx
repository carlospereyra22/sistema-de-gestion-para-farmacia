import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ResumeSaleDialog } from "./resume-sale-dialog";

it("offers continuing a pending sale without discarding it implicitly", () => {
  const onDiscard = vi.fn();
  const onContinue = vi.fn();
  const html = renderToStaticMarkup(
    <ResumeSaleDialog
      count={3}
      onContinue={onContinue}
      onDiscard={onDiscard}
    />,
  );
  expect(html).toContain("¿Querés continuar con la venta?");
  expect(html).toContain("3 productos cargados");
  expect(html).toContain("Continuar venta");
  expect(html).toContain("Descartar venta");
  expect(html).not.toContain("Sí, descartar");
  expect(onDiscard).not.toHaveBeenCalled();
  expect(onContinue).not.toHaveBeenCalled();
});
