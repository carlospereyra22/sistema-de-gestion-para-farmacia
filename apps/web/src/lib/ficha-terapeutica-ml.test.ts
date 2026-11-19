import { describe, expect, it } from "vitest";
import { esLiquidoOral, mgPorMl, tomaEnMl } from "./ficha-terapeutica";

describe("dosis en ml para líquidos", () => {
  it("lee la concentración", () => {
    expect(mgPorMl("50 mg/ml")).toBe(50);
    expect(mgPorMl("dipirona 50 mg/mL")).toBe(50);
    expect(mgPorMl("250 mg/5 ml")).toBe(50);
    expect(mgPorMl("5 g/100 ml")).toBe(50);
    expect(mgPorMl("2%")).toBe(20);
    expect(mgPorMl("jbe.x 100 ml")).toBeNull();
    expect(mgPorMl("400/57 mg/5 ml")).toBeNull();
  });

  it("pasa la toma de adultos a ml", () => {
    expect(tomaEnMl("500 mg-1 g cada 6-8 h (máx. 4 g/día).", 50)).toBe(
      "10-20 ml",
    );
    expect(tomaEnMl("400 mg cada 8 h.", 20)).toBe("20 ml");
    expect(tomaEnMl("1 g cada 8 h.", 500)).toBe("2 ml");
    // Por kilo, por zonas o sin cantidad: no se calcula.
    expect(tomaEnMl("10 mg/kg cada 8 h.", 50)).toBeNull();
    expect(tomaEnMl("Colirio: 1 gota cada 8 h.", 50)).toBeNull();
    expect(tomaEnMl("1 comprimido cada 24 h.", 50)).toBeNull();
  });

  it("reconoce los líquidos orales", () => {
    expect(esLiquidoOral("jbe.x 100 ml")).toBe(true);
    expect(esLiquidoOral("gts.x 20 ml")).toBe(true);
    expect(esLiquidoOral("susp.x 60 ml")).toBe(true);
    expect(esLiquidoOral("comp.x 10")).toBe(false);
    expect(esLiquidoOral("a.x 5 x 2 ml")).toBe(false);
  });
});
