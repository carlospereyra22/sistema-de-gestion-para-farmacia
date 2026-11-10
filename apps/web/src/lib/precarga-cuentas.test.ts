import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerAccount } from "./api";

const api = vi.hoisted(() => ({
  getAccountItems: vi.fn(),
  getCustomerAccountMovements: vi.fn(),
  getCustomerAccounts: vi.fn(),
  getParties: vi.fn(),
  getPriceLists: vi.fn(),
}));
vi.mock("./api", () => api);
vi.mock("./price-lists-api", () => ({
  getEffectivePrices: vi.fn(async () => undefined),
}));
vi.mock("./account-due-dates", () => ({
  getAccountDueDates: vi.fn(async () => undefined),
}));
vi.mock("./account-statement", () => ({
  getAccountStatement: vi.fn(async () => undefined),
}));

import {
  olvidarMovimientosPrecargados,
  precargarCuentas,
} from "./precarga-cuentas";

const cuenta = (extra: Partial<CustomerAccount>): CustomerAccount => ({
  id: "c1",
  name: "Juana",
  creditEnabled: true,
  active: true,
  creditLimitMinor: null,
  balanceMinor: "1000",
  movementCount: 2,
  ...extra,
});

describe("precarga de cuentas corrientes (SISTEMA-75)", () => {
  beforeEach(() => {
    olvidarMovimientosPrecargados();
    vi.clearAllMocks();
    api.getParties.mockResolvedValue([]);
    api.getPriceLists.mockResolvedValue([]);
    api.getAccountItems.mockResolvedValue({});
    api.getCustomerAccountMovements.mockResolvedValue([]);
  });

  it("guarda los movimientos de los que deben y los vuelve a pedir sólo si la cuenta cambió", async () => {
    api.getCustomerAccounts.mockResolvedValue([
      cuenta({ id: "c1" }),
      cuenta({ id: "c2", balanceMinor: "0" }),
    ]);
    await precargarCuentas("t", "o1", "b1");
    expect(api.getCustomerAccountMovements).toHaveBeenCalledTimes(1);
    expect(api.getCustomerAccountMovements).toHaveBeenCalledWith(
      "t",
      "o1",
      "b1",
      "c1",
    );

    await precargarCuentas("t", "o1", "b1");
    expect(api.getCustomerAccountMovements).toHaveBeenCalledTimes(1);

    api.getCustomerAccounts.mockResolvedValue([
      cuenta({ id: "c1", balanceMinor: "500", movementCount: 3 }),
    ]);
    await precargarCuentas("t", "o1", "b1");
    expect(api.getCustomerAccountMovements).toHaveBeenCalledTimes(2);
  });

  it("si no se pudieron pedir, los vuelve a intentar la próxima vez", async () => {
    api.getCustomerAccounts.mockResolvedValue([cuenta({ id: "c1" })]);
    api.getCustomerAccountMovements.mockRejectedValueOnce(new Error("red"));
    await precargarCuentas("t", "o1", "b1");
    await precargarCuentas("t", "o1", "b1");
    expect(api.getCustomerAccountMovements).toHaveBeenCalledTimes(2);
  });
});
