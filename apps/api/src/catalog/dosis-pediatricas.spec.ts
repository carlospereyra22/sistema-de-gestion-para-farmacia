import { DOSIS_PEDIATRICAS } from "./dosis-pediatricas";
import { DOSIS_ORIENTATIVAS } from "./guias-dosis.data";
import { claveGuia } from "./guias-principio-activo";

describe("dosis infantil por kilo", () => {
  const claves = new Set(Object.keys(DOSIS_ORIENTATIVAS).map(claveGuia));

  it.each(Object.entries(DOSIS_PEDIATRICAS))(
    "%s tiene guía, dosis y topes coherentes",
    (clave, dosis) => {
      // La clave tiene que ser la de una guía: si no, nunca se muestra.
      expect(claves.has(clave)).toBe(true);
      const rango = dosis.mgKgToma ?? dosis.mgKgDia;
      expect(rango).toBeDefined();
      expect(rango![0]).toBeGreaterThan(0);
      expect(rango![0]).toBeLessThanOrEqual(rango![1]);
      expect(dosis.tomasPorDia).toBeGreaterThanOrEqual(1);
      expect(dosis.cadaHoras).toMatch(/^\d+(-\d+)?$/);
      // Que la dosis por día no supere el tope por kilo.
      if (dosis.mgKgToma && dosis.maxMgKgDia)
        expect(dosis.mgKgToma[0] * dosis.tomasPorDia).toBeLessThanOrEqual(
          dosis.maxMgKgDia,
        );
    },
  );
});
