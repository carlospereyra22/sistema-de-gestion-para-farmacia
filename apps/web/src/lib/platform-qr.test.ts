import { describe, expect, it } from "vitest";
import { qrCells } from "./platform-qr";

describe("qrCells", () => {
  const uri =
    "otpauth://totp/Farmatec%3Ad%40example.com?secret=ABC&issuer=Farmatec";

  it("devuelve una matriz cuadrada con módulos dentro de ella", () => {
    const { size, cells } = qrCells(uri);

    expect(size).toBeGreaterThan(20);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every(({ x, y }) => x < size && y < size)).toBe(true);
  });

  it("incluye la marca de posición de la esquina superior izquierda", () => {
    const { cells } = qrCells(uri);

    expect(cells).toContainEqual({ x: 0, y: 0 });
    expect(cells).toContainEqual({ x: 6, y: 6 });
  });

  it("cambia con el contenido", () => {
    expect(qrCells(`${uri}1`).cells).not.toEqual(qrCells(`${uri}2`).cells);
  });
});
