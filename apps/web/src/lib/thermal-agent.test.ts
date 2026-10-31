import { afterEach, expect, it, vi } from "vitest";
import {
  prepareThermalTicket,
  sendThermalTicket,
  ThermalAgentUnavailable,
} from "./thermal-agent";
import { accountTicket } from "./thermal-ticket";
const ticket = accountTicket({
  id: "ABC12345",
  createdAt: "2026-09-13T15:00:00Z",
  branchName: "Central",
  customerName: "Cliente",
  amountMinor: "1500",
  method: "CASH",
  note: null,
  balanceAfterMinor: null,
  items: [],
});
afterEach(() => vi.unstubAllGlobals());
it("offers recovery when the agent responds but its printer is missing", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      protocol: "gestion-v21-minor-v1",
      installed: false,
      printer: "Termica anterior",
    }),
  });
  vi.stubGlobal("fetch", fetch);
  await expect(prepareThermalTicket(ticket)).rejects.toBeInstanceOf(
    ThermalAgentUnavailable,
  );
  await expect(prepareThermalTicket(ticket)).rejects.toThrow("driver oficial");
  expect(fetch.mock.calls[0]?.[0]).toContain("/status");
  expect(fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
});
it("offers setup only on connection failure, without claiming the agent is uninstalled", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  await expect(prepareThermalTicket(ticket)).rejects.toBeInstanceOf(
    ThermalAgentUnavailable,
  );
  await expect(prepareThermalTicket(ticket)).rejects.toThrow(
    "permiso de acceso local",
  );
});
it("never fills cleared organization data from a legacy agent fallback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        protocol: "gestion-v21-minor-v1",
        storeFallback: {
          name: "Example",
          address: "Example address",
          contact: "Example phone",
        },
      }),
    }),
  );
  const value = {
    ...ticket,
    store: { name: "Farmacia", address: "", contact: "" },
  };
  expect(await prepareThermalTicket(value)).toEqual(value);
});
it("rejects legacy agents that would recalculate totals", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.0.0" }),
    }),
  );
  await expect(prepareThermalTicket(ticket)).rejects.toThrow("otro agente");
});
it("sends persisted minor units and the same id on retries, never reports an error as printed", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ ok: false, error: "Impresora no encontrada" }),
  });
  vi.stubGlobal("fetch", fetch);
  await expect(sendThermalTicket(ticket, "request-id")).rejects.toThrow(
    "Impresora no encontrada",
  );
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
    requestId: "request-id",
    sale: ticket,
  });
});
