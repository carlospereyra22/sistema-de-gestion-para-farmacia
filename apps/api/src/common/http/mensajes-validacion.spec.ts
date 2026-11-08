import type { ValidationError } from "class-validator";
import { mensajesValidacion } from "./mensajes-validacion";

const error = (
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError => ({ property, constraints, children });

describe("mensajes de validación en castellano", () => {
  it("traduce datos de más y tipos equivocados", () => {
    expect(
      mensajesValidacion([
        error("tipo", {
          whitelistValidation: "property tipo should not exist",
        }),
        error("items", { isArray: "items must be an array" }),
      ]),
    ).toEqual([
      "El dato «tipo» no corresponde.",
      "«items» tiene que ser una lista.",
    ]);
  });

  it("incluye los campos anidados y no deja nada en inglés", () => {
    const mensajes = mensajesValidacion([
      error("items", {}, [
        error("0", {}, [
          error("quantity", { isInt: "quantity must be an integer" }),
        ]),
      ]),
      error("rara", { reglaDesconocida: "something in english" }),
    ]);
    expect(mensajes).toEqual([
      "«items.0.quantity» tiene que ser un número entero.",
      "«rara» no es válido.",
    ]);
    expect(mensajes.join(" ")).not.toMatch(/must|should|english/);
  });
});
