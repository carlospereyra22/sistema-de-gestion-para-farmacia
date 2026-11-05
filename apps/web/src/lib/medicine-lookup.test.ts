import { describe, expect, it } from "vitest";
import { medicineLookupLinked, medicineNameIsFree } from "./medicine-lookup";

describe("nombre que permite la carga automática", () => {
  it("vacío o igual al de la factura no la frena", () => {
    expect(medicineNameIsFree("")).toBe(true);
    expect(
      medicineNameIsFree("NOVALGINA COMPR. X30", "NOVALGINA COMPR. X30"),
    ).toBe(true);
  });

  it("escrito por el usuario la frena", () => {
    expect(medicineNameIsFree("Novalgina")).toBe(false);
    expect(medicineNameIsFree("Novalgina", "NOVALGINA COMPR. X30")).toBe(false);
  });
});

describe("medicamento vinculado al repetir la búsqueda", () => {
  it("conserva la elección del usuario para ese código", () => {
    expect(
      medicineLookupLinked(false, "07790375001285", "07790375001285"),
    ).toBe(true);
  });

  it("no vincula otro código", () => {
    expect(
      medicineLookupLinked(false, "07790375001285", "07793640215479"),
    ).toBe(false);
  });

  it("sin elección vale la vinculación automática", () => {
    expect(medicineLookupLinked(true, "", "07793640215479")).toBe(true);
    expect(medicineLookupLinked(false, "", "07793640215479")).toBe(false);
  });
});
