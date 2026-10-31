import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OperationConfirmDialog } from "./operation-confirm-dialog";
it("requires a reason before confirming cancellation", () => {
  const html = renderToStaticMarkup(
    <OperationConfirmDialog
      title="Cancelar compra"
      description="Se conserva lo recibido."
      requireReason
      onConfirm={async () => {}}
      onClose={() => {}}
    />,
  );
  expect(html).toContain("Motivo");
  expect(html).toContain("disabled");
  expect(html).toContain("Se conserva lo recibido.");
});
