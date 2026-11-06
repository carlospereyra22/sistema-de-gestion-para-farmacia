import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CashRegisterPicker, SaleCashStatus } from "./cash-register-picker";
import type { CashRegister } from "./lib/api";

const registers = [
  { id: "a", name: "Mostrador", active: true },
  { id: "b", name: "Perfumería", active: true },
] as CashRegister[];
const sessionA = { id: "sesion-a", cashRegisterId: "a" };
const sessionB = { id: "sesion-b", cashRegisterId: "b" };

const status = (
  openSessions: (typeof sessionA)[],
  session?: typeof sessionA,
  allowWithoutSession = true,
) =>
  renderToStaticMarkup(
    <SaleCashStatus
      registers={registers}
      openSessions={openSessions}
      session={session}
      allowWithoutSession={allowWithoutSession}
      onChange={vi.fn()}
    />,
  );

const picker = (value: string, disabled = false) =>
  renderToStaticMarkup(
    <CashRegisterPicker
      registers={registers}
      openSessions={[sessionA]}
      value={value}
      onChange={vi.fn()}
      disabled={disabled}
    />,
  );

it("usa el selector del sistema y muestra el estado de la caja elegida", () => {
  const html = picker("a");
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-label="Caja"');
  expect(html).toContain("Mostrador · Abierta");
  expect(html).not.toContain("<select");
  expect(picker("b")).toContain("Perfumería · Cerrada");
});

it("se puede deshabilitar mientras se guarda", () => {
  expect(picker("a", true)).toMatch(/<button[^>]*disabled=""/);
  expect(picker("a")).not.toMatch(/<button[^>]*disabled=""/);
});

it("con una caja abierta muestra su nombre sin pedir elegir", () => {
  const html = status([sessionA], sessionA);
  expect(html).toContain("Caja abierta · Mostrador");
  expect(html).not.toContain("<select");
});

it("con varias cajas abiertas permite cambiar la caja del cobro", () => {
  const html = status([sessionA, sessionB], sessionB);
  expect(html).toContain('aria-label="Caja para cobrar"');
  expect(html).toContain('role="combobox"');
  expect(html).toContain("Perfumería");
  expect(html).not.toContain("<select");
  expect(html).not.toContain("Elegí en qué caja cobrar");
});

it("pide elegir si hay varias abiertas y ninguna preferida", () => {
  expect(status([sessionA, sessionB])).toContain("Elegí en qué caja cobrar");
});

it("sin cajas abiertas conserva los avisos de cobro pendiente", () => {
  expect(status([])).toContain("Sin caja · el cobro queda pendiente");
  expect(status([], undefined, false)).toContain("Sin caja abierta");
});
