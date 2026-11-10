import { expect, it } from "vitest";
import { fechaInformada } from "./fecha-informada";

it("muestra la fecha de la base de la PC como fecha de Argentina (SISTEMA-86)", () => {
  expect(fechaInformada("2026-11-05T12:23:34.062Z")).toBe("5/11/2026");
  // De noche en UTC todavía es el día anterior en Argentina.
  expect(fechaInformada("2026-11-06T02:00:00.000Z")).toBe("5/11/2026");
  expect(fechaInformada("05/11/2026")).toBe("05/11/2026");
  expect(fechaInformada(null)).toBe("no disponible");
});
