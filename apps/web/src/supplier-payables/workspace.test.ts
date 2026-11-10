import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("returns to the refreshed list after payment without opening another dialog", () => {
  const source = readFileSync(
    new URL("./workspace.tsx", import.meta.url),
    "utf8",
  );
  const editor = source.split("<PaymentEditor")[1]?.split("/>")[0];
  expect(editor).toBeDefined();
  const saved = editor?.split("onSaved={(donde: DondeQuedo) => {")[1];
  expect(saved).toContain("setPaying(undefined)");
  expect(saved).toContain("setRevision((r) => r + 1)");
  expect(saved).toContain('"Pago registrado.');
  // Sin conexión avisa que quedó en la PC (SISTEMA-73).
  expect(saved).toContain('donde === "PC"');
  expect(saved).not.toContain("openDetail(");
  expect(saved).not.toContain("setDetail(");
});

it("usa el selector del sistema en filtros y formularios, sin select nativo", () => {
  for (const file of [
    "./workspace.tsx",
    "./invoice-editor.tsx",
    "./payment-editor.tsx",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).toContain("<ProductFilterSelect");
    expect(source).not.toContain("<select");
  }
});

it("titula la columna de botones del listado", () => {
  const source = readFileSync(
    new URL("./workspace.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain('"Acciones",');
});

it("avisa abajo a la derecha, también por encima del detalle", () => {
  const source = readFileSync(
    new URL("./workspace.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain("<StatusToast message={notice}");
  expect(source).toContain("{!detail && toast}");
  expect(source).not.toContain('role="status"');
});

it("no muestra solicitud conservada mientras se envía la deuda", () => {
  const source = readFileSync(
    new URL("./invoice-editor.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain("{draft.locked && !busy && (");
});
