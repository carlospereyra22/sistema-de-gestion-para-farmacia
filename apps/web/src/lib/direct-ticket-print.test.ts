import { beforeEach, expect, it, vi } from "vitest";
import { directTicketPrint, ExistingPrintAttempt } from "./direct-ticket-print";
import { prepareThermalTicket, sendThermalTicket } from "./thermal-agent";
import { accountTicket } from "./thermal-ticket";
vi.mock("./thermal-agent", () => ({
  prepareThermalTicket: vi.fn(),
  sendThermalTicket: vi.fn(),
}));
const ticket = accountTicket({
  id: "ticket",
  createdAt: "2026-09-14T13:00:00Z",
  branchName: "Central",
  customerName: "Cliente",
  amountMinor: "1500",
  method: "CASH",
  note: null,
  balanceAfterMinor: null,
  items: [],
});
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prepareThermalTicket).mockResolvedValue(ticket);
  vi.mocked(sendThermalTicket).mockResolvedValue();
});
it("prints directly once and requires confirmation for another copy", async () => {
  const state = storage();
  await directTicketPrint(ticket, "initial", state);
  await expect(
    directTicketPrint(ticket, "initial", state),
  ).rejects.toBeInstanceOf(ExistingPrintAttempt);
  expect(sendThermalTicket).toHaveBeenCalledTimes(1);
  const first = vi.mocked(sendThermalTicket).mock.calls[0]![1];
  await directTicketPrint(ticket, "copy", state);
  expect(vi.mocked(sendThermalTicket).mock.calls[1]![1]).not.toBe(first);
});
it("deduplicates simultaneous calls including React StrictMode", async () => {
  const state = storage();
  await Promise.all([
    directTicketPrint(ticket, "initial", state),
    directTicketPrint(ticket, "initial", state),
  ]);
  expect(sendThermalTicket).toHaveBeenCalledTimes(1);
});
it("does not replay uncertain results automatically and explicit retry keeps the id", async () => {
  const state = storage();
  vi.mocked(sendThermalTicket).mockRejectedValueOnce(
    new Error("Lost response"),
  );
  await expect(directTicketPrint(ticket, "initial", state)).rejects.toThrow(
    "Lost response",
  );
  await expect(directTicketPrint(ticket, "initial", state)).rejects.toThrow(
    "sin confirmación",
  );
  expect(sendThermalTicket).toHaveBeenCalledTimes(1);
  await directTicketPrint(ticket, "retry", state);
  const calls = vi.mocked(sendThermalTicket).mock.calls;
  expect(calls[0]![1]).toBe(calls[1]![1]);
});
it("never sends if the attempt cannot be saved durably", async () => {
  await expect(
    directTicketPrint(ticket, "initial", {
      getItem: () => null,
      setItem: () => {
        throw Error("Storage unavailable");
      },
    }),
  ).rejects.toThrow();
  expect(sendThermalTicket).not.toHaveBeenCalled();
});
it("a disconnected component does not create or send a job", async () => {
  const state = storage();
  vi.mocked(prepareThermalTicket).mockRejectedValueOnce(new Error("Offline"));
  await expect(directTicketPrint(ticket, "initial", state)).rejects.toThrow(
    "Offline",
  );
  expect(sendThermalTicket).not.toHaveBeenCalled();
  await directTicketPrint(ticket, "initial", state);
  expect(sendThermalTicket).toHaveBeenCalledTimes(1);
});
