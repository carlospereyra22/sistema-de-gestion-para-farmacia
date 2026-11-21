import { expect, it } from "vitest";
import { logoPreview, prepareTicketLogo } from "./ticket-logo";
it("renders the exact monochrome raster and keeps the legacy logo as fallback", () => {
  expect(logoPreview()).toBe("/logo-remito.png");
  expect(logoPreview("invalid")).toBe("/logo-remito.png");
  expect(decodeURIComponent(logoPreview("80" + "00".repeat(2047)))).toContain(
    '<rect x="0" y="0" width="1" height="1"/>',
  );
});
it("rejects unsupported files before decoding", async () => {
  await expect(
    prepareTicketLogo(new File(["test"], "x.svg", { type: "image/svg+xml" })),
  ).rejects.toThrow("PNG");
});

const lleno = (r: number, g: number, b: number, a = 255) =>
  Array.from({ length: 128 * 128 }, () => [r, g, b, a]).flat();
const negros = (raster: string) =>
  [...raster].reduce(
    (total, hex) =>
      total + parseInt(hex, 16).toString(2).replace(/0/g, "").length,
    0,
  );

it("blanco, negro y transparente salen como son", async () => {
  const { rasterDesdePixeles } = await import("./ticket-logo");
  expect(negros(rasterDesdePixeles(lleno(255, 255, 255)))).toBe(0);
  expect(negros(rasterDesdePixeles(lleno(0, 0, 0)))).toBe(16384);
  // Transparente cuenta como blanco.
  expect(negros(rasterDesdePixeles(lleno(0, 0, 0, 0)))).toBe(0);
});

it("un relleno de color intermedio se simula con puntos, no sale negro", async () => {
  const { rasterDesdePixeles } = await import("./ticket-logo");
  // El azul grisáceo de un logo (#627f8f): antes salía todo negro.
  const proporcion = negros(rasterDesdePixeles(lleno(98, 127, 143))) / 16384;
  expect(proporcion).toBeGreaterThan(0.4);
  expect(proporcion).toBeLessThan(0.65);
});
