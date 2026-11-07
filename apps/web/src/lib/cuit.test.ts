import { describe, expect, it } from "vitest";
import { avisoCuit, cuitValido, digitosCuit, formatearCuit } from "./cuit";

describe("CUIT", () => {
  it("acepta guiones, espacios y pegado, y guarda sólo 11 números", () => {
    expect(digitosCuit("20-42641309-5")).toBe("20426413095");
    expect(digitosCuit(" 20 42641309 5 ")).toBe("20426413095");
    expect(digitosCuit("20-42641309-55")).toBe("20426413095");
  });

  it("muestra los guiones a medida que se escribe", () => {
    expect(formatearCuit("")).toBe("");
    expect(formatearCuit("20")).toBe("20");
    expect(formatearCuit("204")).toBe("20-4");
    expect(formatearCuit("2042641309")).toBe("20-42641309");
    expect(formatearCuit("20426413095")).toBe("20-42641309-5");
  });

  it("valida el dígito verificador como la API", () => {
    expect(cuitValido("20426413095")).toBe(true);
    expect(cuitValido("20247237837")).toBe(true);
    expect(cuitValido("20426413096")).toBe(false);
    expect(cuitValido("2042641309")).toBe(false);
  });

  it("avisa cuántos números faltan o si el verificador no coincide", () => {
    expect(avisoCuit("")).toBeNull();
    expect(avisoCuit("2042641309")).toBe("Falta 1 número.");
    expect(avisoCuit("204264")).toBe("Faltan 5 números.");
    expect(avisoCuit("20426413096")).toMatch(/dígito verificador/);
    expect(avisoCuit("20426413095")).toBeNull();
  });
});
