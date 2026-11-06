import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  InventoryFormActions,
  InventoryScanField,
} from "./inventory-form-parts";

const scan = (status: string, error = false) =>
  renderToStaticMarkup(
    <InventoryScanField
      value=""
      status={status}
      error={error}
      inputRef={createRef<HTMLInputElement>()}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );

it("el aviso del escáner flota para no mover el formulario", () => {
  expect(scan("")).not.toContain("top-full");
  expect(scan("Producto seleccionado.")).toContain("absolute");
  expect(scan("Código inexistente.", true)).toContain("text-rose-600");
});

it("Limpiar no envía el formulario y se apaga si no hay nada cargado", () => {
  const actions = (canClear: boolean) =>
    renderToStaticMarkup(
      <InventoryFormActions
        submitLabel="Registrar ajuste"
        canClear={canClear}
        onClear={vi.fn()}
      />,
    );
  expect(actions(true)).toContain('type="button"');
  expect(actions(true)).toContain("Registrar ajuste");
  expect(actions(true)).not.toContain('disabled=""');
  expect(actions(false)).toContain('disabled=""');
});
