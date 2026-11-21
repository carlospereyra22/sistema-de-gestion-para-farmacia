import { expect, it } from "vitest";
import { borradorVacio } from "./compra-borrador-vacio";

const nuevo = {
  step: "edit" as const,
  supplierId: "",
  reference: "",
  notes: "",
  orderedAt: "",
  lines: [],
  lots: [],
};

it("una compra nueva sin tocar está vacía", () => {
  expect(borradorVacio(nuevo)).toBe(true);
  // Espacios en blanco no son datos.
  expect(borradorVacio({ ...nuevo, notes: "   " })).toBe(true);
});

it("cualquier dato cargado ya no está vacía", () => {
  expect(borradorVacio({ ...nuevo, supplierId: "p1" })).toBe(false);
  expect(borradorVacio({ ...nuevo, reference: "FC 0001" })).toBe(false);
  expect(borradorVacio({ ...nuevo, notes: "Urgente" })).toBe(false);
  expect(borradorVacio({ ...nuevo, orderedAt: "2026-11-19" })).toBe(false);
  expect(borradorVacio({ ...nuevo, lines: [{}] })).toBe(false);
  expect(borradorVacio({ ...nuevo, step: "receive" })).toBe(false);
  expect(borradorVacio({ ...nuevo, locked: { path: "x" } })).toBe(false);
});
