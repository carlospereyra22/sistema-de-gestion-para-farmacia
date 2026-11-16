import { describe, expect, it } from "vitest";

import { ofertasVisibles } from "./ofertas-canal";

describe("ofertas según el módulo Catálogo online", () => {
  const ofertas = [
    { id: "mostrador", channel: "POS" as const },
    { id: "catalogo", channel: "CATALOG" as const },
    { id: "ambos", channel: "BOTH" as const },
  ];

  it("sin el módulo no aparecen las que son sólo del catálogo", () => {
    expect(ofertasVisibles(ofertas, false).map((o) => o.id)).toEqual([
      "mostrador",
      "ambos",
    ]);
  });

  it("con el módulo se ven todas", () => {
    expect(ofertasVisibles(ofertas, true)).toHaveLength(3);
  });
});
