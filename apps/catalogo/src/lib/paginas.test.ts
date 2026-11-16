import { describe, expect, it } from "vitest";

import { paginasVisibles, totalDePaginas } from "./paginas";

describe("paginador del catálogo", () => {
  it("con pocas páginas las muestra todas", () => {
    expect(paginasVisibles(1, 1)).toEqual([1]);
    expect(paginasVisibles(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("con muchas, la primera, la última y las vecinas", () => {
    expect(paginasVisibles(1, 12)).toEqual([1, 2, "…", 12]);
    expect(paginasVisibles(5, 12)).toEqual([1, "…", 4, 5, 6, "…", 12]);
    expect(paginasVisibles(12, 12)).toEqual([1, "…", 11, 12]);
  });

  it("no pone «…» para saltear una sola página", () => {
    expect(paginasVisibles(4, 12)).toEqual([1, 2, 3, 4, 5, "…", 12]);
  });

  it("cuenta las páginas", () => {
    expect(totalDePaginas(0, 40)).toBe(1);
    expect(totalDePaginas(475, 40)).toBe(12);
  });
});
