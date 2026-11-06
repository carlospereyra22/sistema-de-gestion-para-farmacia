import { describe, expect, it, vi } from "vitest";
import {
  cashSessionLabel,
  preferredCashSessionId,
  readCashRegisterChoice,
  resolveCashRegister,
  resolveSaleSession,
  saveCashRegisterChoice,
} from "./active-cash-register";

const registers = [
  { id: "a", name: "Mostrador" },
  { id: "b", name: "Perfumería" },
  { id: "c", name: "Delivery" },
];
const sessionOf = (cashRegisterId: string) => ({
  id: `sesion-${cashRegisterId}`,
  cashRegisterId,
});

describe("resolveCashRegister", () => {
  const resolve = (
    chosen: string,
    open: string[],
    defaultRegisterId?: string | null,
  ) =>
    resolveCashRegister({
      registers,
      openSessions: open.map(sessionOf),
      chosen,
      defaultRegisterId,
    });

  it("respeta la caja elegida aunque esté cerrada, para poder abrirla", () => {
    expect(resolve("b", ["a"])).toBe("b");
  });
  it("ignora una elección que ya no existe en la sucursal", () => {
    expect(resolve("otra-sucursal", ["a"])).toBe("a");
  });
  it("sin elección prefiere la predeterminada si está abierta", () => {
    expect(resolve("", ["a", "b"], "b")).toBe("b");
  });
  it("una caja abierta le gana a la predeterminada cerrada", () => {
    expect(resolve("", ["c"], "b")).toBe("c");
  });
  it("con todo cerrado usa la predeterminada y si no la primera", () => {
    expect(resolve("", [], "b")).toBe("b");
    expect(resolve("", [])).toBe("a");
  });
  it("no devuelve nada si la sucursal no tiene cajas", () => {
    expect(
      resolveCashRegister({ registers: [], openSessions: [], chosen: "a" }),
    ).toBe("");
  });
});

describe("resolveSaleSession", () => {
  it("cobra en la caja preferida si está abierta", () => {
    expect(
      resolveSaleSession([sessionOf("a"), sessionOf("b")], ["b", "a"])?.id,
    ).toBe("sesion-b");
  });
  it("sigue con la siguiente preferencia si la primera está cerrada", () => {
    expect(
      resolveSaleSession([sessionOf("a"), sessionOf("b")], ["c", "a"])?.id,
    ).toBe("sesion-a");
  });
  it("usa la única abierta aunque la preferida esté cerrada", () => {
    expect(resolveSaleSession([sessionOf("a")], ["b"])?.id).toBe("sesion-a");
  });
  it("no elige sola entre varias abiertas sin preferencia", () => {
    expect(
      resolveSaleSession([sessionOf("a"), sessionOf("b")], ["", null]),
    ).toBeUndefined();
    expect(
      resolveSaleSession([sessionOf("a"), sessionOf("b")], ["c"]),
    ).toBeUndefined();
  });
  it("sin cajas abiertas no hay sesión", () => {
    expect(resolveSaleSession([], ["a"])).toBeUndefined();
  });
});

describe("elección guardada", () => {
  it("se guarda por organización y sucursal", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    saveCashRegisterChoice("org", "centro", "a", storage);
    expect(readCashRegisterChoice("org", "centro", storage)).toBe("a");
    expect(readCashRegisterChoice("org", "norte", storage)).toBe("");
  });
  it("sigue funcionando si el almacenamiento falla", () => {
    const fail = vi.fn(() => {
      throw new Error("bloqueado");
    });
    expect(readCashRegisterChoice("org", "b", { getItem: fail })).toBe("");
    expect(() =>
      saveCashRegisterChoice("org", "b", "a", { setItem: fail }),
    ).not.toThrow();
  });
});

it("sugiere la caja del equipo y no elige sola entre varias", () => {
  const open = [sessionOf("a"), sessionOf("b")];
  const saved = (value: string | null) => ({ getItem: () => value });
  expect(preferredCashSessionId(open, "org", "b", saved("b"))).toBe("sesion-b");
  expect(preferredCashSessionId(open, "org", "b", saved(null))).toBe("");
  expect(preferredCashSessionId([open[0]!], "org", "b", saved(null))).toBe(
    "sesion-a",
  );
});

it("nombra la caja de una sesión y resiste una caja desconocida", () => {
  const session = { ...sessionOf("a"), openedAt: "2026-11-05T14:30:00Z" };
  expect(cashSessionLabel(session, registers)).toContain("Mostrador · ");
  expect(cashSessionLabel(session, [])).toContain("Caja · ");
});
