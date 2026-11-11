import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  getSaleFiscalCapabilities: vi.fn().mockResolvedValue({ voucherTypes: [11] }),
}));

import { getSaleFiscalCapabilities } from "./api";
import { precargarVentas } from "./precarga-ventas";

describe("precarga de Ventas", () => {
  it("pide las opciones fiscales de la sucursal para facturar sin conexión", async () => {
    await precargarVentas("t", "o1", "b1");
    expect(getSaleFiscalCapabilities).toHaveBeenCalledWith("t", "o1", "b1");
  });
});
