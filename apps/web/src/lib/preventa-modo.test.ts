import { describe, expect, it } from "vitest";

import { abrePreventaMovil } from "./preventa-modo";

const PREVENTISTA = [
  "PREVENTA_SELL",
  "CATALOG_READ",
  "OFFER_READ",
  "PARTY_READ",
];
const REPARTIDOR = ["PREVENTA_DELIVER", "PARTY_READ"];
const DUENO = ["PREVENTA_MANAGE", "ORGANIZATION_MANAGE", "SALE_MANAGE"];

describe("¿abre la preventa a pantalla completa?", () => {
  it("el preventista y el repartidor van directo a la preventa", () => {
    for (const permisos of [PREVENTISTA, REPARTIDOR])
      expect(
        abrePreventaMovil({ habilitada: true, permisos, preferencia: null }),
      ).toBe(true);
  });

  it("quien atiende el mostrador o administra entra a la gestión", () => {
    expect(
      abrePreventaMovil({
        habilitada: true,
        permisos: [...PREVENTISTA, "SALE_MANAGE"],
        preferencia: null,
      }),
    ).toBe(false);
    expect(
      abrePreventaMovil({
        habilitada: true,
        permisos: DUENO,
        preferencia: null,
      }),
    ).toBe(false);
  });

  it("la elección manual manda, salvo sin módulo o sin permiso", () => {
    expect(
      abrePreventaMovil({
        habilitada: true,
        permisos: DUENO,
        preferencia: "movil",
      }),
    ).toBe(true);
    expect(
      abrePreventaMovil({
        habilitada: true,
        permisos: PREVENTISTA,
        preferencia: "gestion",
      }),
    ).toBe(false);
    expect(
      abrePreventaMovil({
        habilitada: false,
        permisos: PREVENTISTA,
        preferencia: "movil",
      }),
    ).toBe(false);
    expect(
      abrePreventaMovil({
        habilitada: true,
        permisos: ["SALE_MANAGE"],
        preferencia: "movil",
      }),
    ).toBe(false);
  });
});
