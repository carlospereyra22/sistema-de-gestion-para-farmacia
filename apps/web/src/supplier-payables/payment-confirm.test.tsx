import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentConfirm } from "./payment-confirm";

const props = {
  supplierName: "juan",
  amount: "$ 700,00",
  method: "Transferencia",
  date: "06/11/2026",
  outcome: "La deuda quedará pagada.",
  onBack: () => undefined,
  onConfirm: () => undefined,
};

describe("confirmación del pago a proveedor", () => {
  it("resume lo que se va a registrar antes de enviarlo", () => {
    const html = renderToStaticMarkup(
      <PaymentConfirm {...props} busy={false} />,
    );
    expect(html).toContain("¿Seguro que querés registrar este pago?");
    for (const text of [
      "juan",
      "$ 700,00",
      "Transferencia",
      "06/11/2026",
      "La deuda quedará pagada.",
      "Sí, registrar pago",
    ])
      expect(html).toContain(text);
  });

  it("bloquea los botones mientras se registra", () => {
    const html = renderToStaticMarkup(<PaymentConfirm {...props} busy />);
    expect(html).toContain("Registrando…");
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });

  it("el formulario pide confirmación solo en el primer intento", () => {
    const source = readFileSync(
      new URL("./payment-editor.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("if (locked) void send();");
    expect(source).toContain("else setConfirming(true);");
  });
});
