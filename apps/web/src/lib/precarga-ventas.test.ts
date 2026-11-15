import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  getSaleFiscalCapabilities: vi.fn().mockResolvedValue({ voucherTypes: [11] }),
}));
vi.mock("./ofertas-api", () => ({
  getOfertasVigentes: vi.fn().mockRejectedValue(new Error("sin permiso")),
}));

import { getSaleFiscalCapabilities } from "./api";
import { getOfertasVigentes } from "./ofertas-api";
import { precargarVentas } from "./precarga-ventas";

describe("precarga de Ventas", () => {
  it("pide las opciones fiscales de la sucursal para facturar sin conexión", async () => {
    await precargarVentas("t", "o1", "b1");
    expect(getSaleFiscalCapabilities).toHaveBeenCalledWith("t", "o1", "b1");
  });

  it("guarda las ofertas vigentes para venderlas sin conexión, sin frenar si fallan", async () => {
    await expect(precargarVentas("t", "o1", "b1")).resolves.toBeUndefined();
    expect(getOfertasVigentes).toHaveBeenCalledWith("t", "o1");
  });
});
