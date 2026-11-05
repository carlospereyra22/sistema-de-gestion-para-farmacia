import type { PrismaService } from "../prisma/prisma.service";
import type { AlfaBetaService } from "./alfabeta.service";
import type { CatalogItemForRefresh } from "./medicine-catalog";
import { MedicineCatalogService } from "./medicine-catalog.service";

describe("actualización de fuentes de medicamentos", () => {
  it("espacia las solicitudes aunque se inicien simultáneamente", async () => {
    const service = new MedicineCatalogService(
      {} as PrismaService,
      {} as AlfaBetaService,
    );
    const now = jest.spyOn(Date, "now").mockReturnValue(1000);
    const pause = jest.fn().mockResolvedValue(undefined);
    service.pause = pause;
    try {
      await Promise.all(
        Array.from({ length: 3 }, () => service["waitForSourceRequest"]()),
      );
      expect(pause.mock.calls).toEqual([[1500], [3000]]);
    } finally {
      now.mockRestore();
    }
  });

  it("consulta hasta cuatro enlaces a la vez y completa todos los resultados", async () => {
    const service = new MedicineCatalogService(
      {} as PrismaService,
      {} as AlfaBetaService,
    );
    const items = Array.from({ length: 9 }, (_, index) => ({
      id: String(index),
      referenceUrl: `https://preciosderemedios.com.ar/result/${index}`,
      sourceRowKey: String(index),
    })) as CatalogItemForRefresh[];
    const releases: Array<() => void> = [];
    let active = 0;
    let maximum = 0;
    const read = jest.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return [];
    });

    const resultPromise = service["refreshSource"](items, new Map(), read);
    await new Promise((resolve) => setImmediate(resolve));
    expect(read).toHaveBeenCalledTimes(4);
    releases.splice(0).forEach((release) => release());
    await new Promise((resolve) => setImmediate(resolve));
    expect(read).toHaveBeenCalledTimes(8);
    releases.splice(0).forEach((release) => release());
    await new Promise((resolve) => setImmediate(resolve));
    expect(read).toHaveBeenCalledTimes(9);
    releases.splice(0).forEach((release) => release());

    const result = await resultPromise;
    expect(maximum).toBe(4);
    expect(result.links).toBe(9);
    expect(result.missing).toBe(9);
    expect(result.failedLinks).toBe(0);
  });
});
