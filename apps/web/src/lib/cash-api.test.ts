import { afterEach, expect, it, vi } from "vitest";
import {
  CashCloseRejected,
  closeCashSession,
  getLatestCashClosure,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

const respond = (body: string, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(body, { status })),
  );
const latest = () => getLatestCashClosure("token", "org", "branch", "register");
const close = () => closeCashSession("token", "org", "branch", "session", 100);

it("una caja sin cierres responde vacío y se lee como sin cierre", async () => {
  respond("");
  await expect(latest()).resolves.toBeNull();
});

it("lee el último cierre cuando existe", async () => {
  respond(JSON.stringify({ id: "closure" }));
  await expect(latest()).resolves.toEqual({ id: "closure" });
});

it("identifica los cierres rechazados porque cambió la sesión", async () => {
  respond(JSON.stringify({ message: "El efectivo esperado cambió." }), 409);
  const conflict = await close().catch((cause: unknown) => cause);
  expect(conflict).toBeInstanceOf(CashCloseRejected);
  expect((conflict as Error).message).toBe("El efectivo esperado cambió.");
  respond(JSON.stringify({ message: "La sesión ya está cerrada." }), 404);
  await expect(close()).rejects.toBeInstanceOf(CashCloseRejected);
});

it("no confunde otros errores con un cambio de sesión", async () => {
  respond(JSON.stringify({ message: "Falló el servidor." }), 500);
  const failure = await close().catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).not.toBeInstanceOf(CashCloseRejected);
});
