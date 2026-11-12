import { describe, expect, it } from "vitest";
import {
  presentationUnits,
  splitBaseName,
  suggestSplitTargets,
} from "./split-link";

const producto = (
  id: string,
  name: string,
  presentation: string | null,
  laboratory = "opella",
) => ({
  id,
  name,
  presentation,
  laboratory: { id: laboratory, name: laboratory },
  active: true,
});

describe("sugerencia para abrir cajas", () => {
  it("lee las unidades de la presentación", () => {
    expect(presentationUnits("comp.rec.x 100")).toBe(100);
    expect(presentationUnits("blíster comp.rec.x 10")).toBe(10);
    expect(presentationUnits("20 mg comp.rec.x 14")).toBe(14);
    expect(presentationUnits("susp.oral")).toBeNull();
  });

  it("toma el nombre sin la presentación", () => {
    expect(splitBaseName("BUSCAPINA DUO comp.rec. x 100")).toBe(
      "buscapina duo",
    );
    expect(splitBaseName("Buscapina Duo blíster x10")).toBe("buscapina duo");
    expect(splitBaseName("BUSCAPINA DUO")).toBe("buscapina duo");
  });

  it("propone el blíster del mismo laboratorio con su número", () => {
    const caja = producto("x100", "BUSCAPINA DUO", "comp.rec.x 100");
    const blister = producto("x10", "BUSCAPINA DUO", "blíster comp.rec.x 10");
    const otroLab = producto("otro", "BUSCAPINA DUO", "x 10", "otro");
    const otraDroga = producto("ibu", "IBUPROFENO", "x 10");
    const mayor = producto("x200", "BUSCAPINA DUO", "x 200");
    expect(
      suggestSplitTargets(caja, [caja, blister, otroLab, otraDroga, mayor]),
    ).toEqual([{ product: blister, factor: 10 }]);
  });

  it("sin unidades legibles sugiere el producto sin número", () => {
    const caja = producto("x100", "BUSCAPINA DUO", "comp.rec.x 100");
    const suelto = producto("s", "Buscapina Duo", null);
    expect(suggestSplitTargets(caja, [suelto])).toEqual([
      { product: suelto, factor: null },
    ]);
  });
});
