import { describe, expect, it } from "vitest";
import type { DatosDePadron, FiscalProfile } from "./api";
import { cuitValido } from "./cuit";
import {
  avisosDeDatosFiscales,
  fechaDeInicioValida,
  perfilDesdePadron,
  puedeContinuar,
} from "./datos-fiscales";

const HOY = new Date("2026-11-11T12:00:00Z");
const vacio: FiscalProfile = {
  legalName: "",
  cuit: "",
  vatCondition: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  grossIncomeId: "",
  activityStart: "",
};

describe("datos de la farmacia (SISTEMA-96)", () => {
  it("valida el CUIT con el dígito verificador", () => {
    expect(cuitValido("20247237837")).toBe(true);
    expect(cuitValido("20247237836")).toBe(false);
    expect(avisosDeDatosFiscales({ ...vacio, cuit: "2024" }, HOY).cuit).toBe(
      "Faltan 7 números.",
    );
    expect(
      avisosDeDatosFiscales({ ...vacio, cuit: "20247237836" }, HOY).cuit,
    ).toContain("dígito verificador");
  });

  it("la fecha de inicio tiene que existir y no ser futura", () => {
    expect(fechaDeInicioValida("2020-02-29", HOY)).toBe(true);
    expect(fechaDeInicioValida("2021-02-29", HOY)).toBe(false);
    expect(fechaDeInicioValida("2027-01-01", HOY)).toBe(false);
    expect(fechaDeInicioValida("01/02/2020", HOY)).toBe(false);
  });

  it("el borrador vacío se puede guardar, pero no seguir con errores", () => {
    expect(avisosDeDatosFiscales(vacio, HOY)).toEqual({});
    expect(puedeContinuar({ ...vacio, cuit: "123" }, HOY)).toBe(false);
    expect(
      puedeContinuar(
        { ...vacio, cuit: "20247237837", vatCondition: "MONOTAX" },
        HOY,
      ),
    ).toBe(true);
  });

  it("responsable inscripto no puede continuar: hoy sólo factura C", () => {
    const avisos = avisosDeDatosFiscales(
      { ...vacio, vatCondition: "REGISTERED" },
      HOY,
    );
    expect(avisos.vatCondition).toContain("sólo emite factura C");
    expect(puedeContinuar({ ...vacio, vatCondition: "REGISTERED" }, HOY)).toBe(
      false,
    );
  });

  it("completa el perfil con el padrón sin borrar lo que el padrón no trae", () => {
    const padron: DatosDePadron = {
      cuit: "20247237837",
      nombre: "FARMACIA JUNCOS SRL",
      condicionIva: "Monotributista",
      domicilio: "SAN MARTIN 123",
      localidad: "POSADAS",
      provincia: "MISIONES",
      codigoPostal: "",
      estado: "ACTIVO",
      environment: "HOMOLOGATION",
    };
    expect(
      perfilDesdePadron(
        { ...vacio, postalCode: "3300", grossIncomeId: "123" },
        padron,
      ),
    ).toEqual({
      ...vacio,
      cuit: "20247237837",
      legalName: "FARMACIA JUNCOS SRL",
      vatCondition: "MONOTAX",
      address: "SAN MARTIN 123",
      city: "POSADAS",
      province: "MISIONES",
      postalCode: "3300",
      grossIncomeId: "123",
    });
    expect(
      perfilDesdePadron(vacio, { ...padron, condicionIva: "Consumidor final" })
        .vatCondition,
    ).toBe("");
  });
});
