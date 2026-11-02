import { describe, expect, it } from "vitest";
import {
  findMedicationCategory,
  isMedicationCategoryName,
} from "./medication-category";

describe("categoría de medicamentos", () => {
  it("reconoce el nombre sin distinguir tildes, mayúsculas ni singular", () => {
    expect(isMedicationCategoryName("Medicamentos")).toBe(true);
    expect(isMedicationCategoryName(" MEDICAMENTO ")).toBe(true);
    expect(isMedicationCategoryName("Medicaméntos")).toBe(true);
    expect(isMedicationCategoryName("Dermocosmética")).toBe(false);
  });

  it("devuelve la categoría de medicamentos de la organización", () => {
    expect(
      findMedicationCategory([
        { id: "a", name: "Accesorios" },
        { id: "m", name: "Medicamento" },
      ])?.id,
    ).toBe("m");
    expect(findMedicationCategory(undefined)).toBeUndefined();
  });
});
