import { expect, it } from "vitest";
import {
  actorFilterOptions,
  actorName,
  keepAccountSelection,
  matchesActorFilter,
  matchesCreditFilter,
  newCustomerCredit,
  validActorFilter,
} from "./account-customer-selection";

const accounts = [{ id: "ana" }, { id: "juan" }];

it("conserva el cliente elegido si sigue existiendo", () => {
  expect(keepAccountSelection(accounts, "juan")).toBe("juan");
});
it("vuelve a la lista si el cliente elegido ya no está", () => {
  expect(keepAccountSelection(accounts, "borrado")).toBe("");
});
it("nunca elige un cliente por su cuenta", () => {
  expect(keepAccountSelection(accounts, "")).toBe("");
  expect(keepAccountSelection([], "")).toBe("");
});
it("filtra por cuenta corriente y muestra todos de forma predeterminada", () => {
  const con = { creditEnabled: true };
  const sin = { creditEnabled: false };
  expect(matchesCreditFilter(con, "all")).toBe(true);
  expect(matchesCreditFilter(sin, "all")).toBe(true);
  expect(matchesCreditFilter(con, "with")).toBe(true);
  expect(matchesCreditFilter(sin, "with")).toBe(false);
  expect(matchesCreditFilter(con, "without")).toBe(false);
  expect(matchesCreditFilter(sin, "without")).toBe(true);
});
it("arma las opciones por usuario sin repetir y ofrece sin datos solo si hace falta", () => {
  const luz = { id: "luz", name: "Luz" };
  const ana = { id: "ana", name: "Ana" };
  expect(actorFilterOptions([luz, ana, luz], "Creado por")).toEqual([
    { value: "all", label: "Creado por: todos" },
    { value: "ana", label: "Creado por: Ana" },
    { value: "luz", label: "Creado por: Luz" },
  ]);
  expect(actorFilterOptions([luz, null], "Creado por").at(-1)).toEqual({
    value: "none",
    label: "Creado por: sin datos",
  });
});
it("filtra por usuario y trata a quien no tiene nombre como sin datos", () => {
  const ana = { id: "ana", name: "Ana" };
  const anonimo = { id: "x", name: null };
  expect(matchesActorFilter(ana, "all")).toBe(true);
  expect(matchesActorFilter(ana, "ana")).toBe(true);
  expect(matchesActorFilter(ana, "luz")).toBe(false);
  expect(matchesActorFilter(null, "none")).toBe(true);
  expect(matchesActorFilter(anonimo, "none")).toBe(true);
  expect(actorName(ana)).toBe("Ana");
  expect(actorName(anonimo)).toBe("Sin datos");
  expect(actorName(undefined)).toBe("Sin datos");
});
it("vuelve a todos si el usuario filtrado ya no está entre las opciones", () => {
  const options = [{ value: "all" }, { value: "ana" }];
  expect(validActorFilter(options, "ana")).toBe("ana");
  expect(validActorFilter(options, "luz")).toBe("all");
});
it("habilita al cliente nuevo con tope cero, nunca sin límite", () => {
  expect(newCustomerCredit).toEqual({ enabled: true, creditLimitMinor: 0 });
});
