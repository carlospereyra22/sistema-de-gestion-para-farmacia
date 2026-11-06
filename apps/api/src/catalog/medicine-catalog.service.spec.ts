import type { PrismaService } from "../prisma/prisma.service";
import type { AlfaBetaService } from "./alfabeta.service";
import type { CatalogItemForRefresh } from "./medicine-catalog";
import { MedicineCatalogService } from "./medicine-catalog.service";

describe("actualización de fuentes de medicamentos", () => {
  it("reintenta una vez cuando una solicitud agota el tiempo de espera", async () => {
    const service = new MedicineCatalogService(
      {} as PrismaService,
      {} as AlfaBetaService,
    );
    const item = {
      id: "producto",
      referenceUrl: "https://preciosderemedios.com.ar/result/?busqueda=prueba",
      sourceRowKey: "prueba",
    } as CatalogItemForRefresh;
    const read = jest
      .fn<Promise<[]>, []>()
      .mockRejectedValueOnce(
        new Error("The operation was aborted due to timeout"),
      )
      .mockResolvedValue([]);

    const result = await service["refreshSource"]([item], new Map(), read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result).toEqual(
      expect.objectContaining({ links: 1, failedLinks: 0, stopped: false }),
    );
  });

  it("no reintenta un enlace inválido", async () => {
    const service = new MedicineCatalogService(
      {} as PrismaService,
      {} as AlfaBetaService,
    );
    const item = {
      id: "producto",
      referenceUrl: "https://preciosderemedios.com.ar/result/?busqueda=prueba",
      sourceRowKey: "prueba",
    } as CatalogItemForRefresh;
    const read = jest.fn().mockRejectedValue(new Error("Link inválido"));

    const result = await service["refreshSource"]([item], new Map(), read);
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.failedLinks).toBe(1);
  });

  it("recupera un enlace lento con búsquedas específicas", async () => {
    const service = new MedicineCatalogService(
      {} as PrismaService,
      {} as AlfaBetaService,
    );
    const item = {
      id: "producto",
      referenceUrl:
        "https://preciosderemedios.com.ar/result/?busqueda=acido&combo=Omega+3",
      sourceRowKey: "producto",
    } as CatalogItemForRefresh;
    const read = jest.fn().mockRejectedValue(new Error("TimeoutError"));
    const recover = jest.fn().mockResolvedValue([]);

    const result = await service["refreshSource"](
      [item],
      new Map(),
      read,
      recover,
    );

    expect(read).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith(item.referenceUrl, [item]);
    expect(result).toEqual(
      expect.objectContaining({ links: 1, failedLinks: 0, missing: 1 }),
    );
  });

  it("conserva la combinación y acota por nombre si el enlace amplio no responde", async () => {
    const service = new MedicineCatalogService(
      {} as PrismaService,
      {} as AlfaBetaService,
    );
    const read = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { rowKey: "omega3tgcapsx60", laboratory: "", priceMinor: 100 },
      ]);
    service["remediesRows"] = read;
    const item = {
      name: "OMEGA 3 TG",
      sourceRowKey: "omega3tgcapsx60",
    } as CatalogItemForRefresh;

    const rows = await service["recoverRemediesRows"](
      "https://preciosderemedios.com.ar/result/?busqueda=acido&combo=Omega+3",
      [item],
    );

    expect(read).toHaveBeenCalledTimes(2);
    expect(new URL(read.mock.calls[0][0]).searchParams.get("busqueda")).toBe(
      "omega 3 tg",
    );
    expect(new URL(read.mock.calls[1][0]).searchParams.get("busqueda")).toBe(
      "omega 3",
    );
    expect(new URL(read.mock.calls[1][0]).searchParams.get("combo")).toBe(
      "Omega 3",
    );
    expect(rows).toEqual([
      { rowKey: "omega3tgcapsx60", laboratory: "", priceMinor: 100 },
    ]);
  });

  it("busca juntas las presentaciones con un nombre compartido", async () => {
    const service = new MedicineCatalogService(
      {} as PrismaService,
      {} as AlfaBetaService,
    );
    const rows = [
      { rowKey: "vitaminaccalihepatcapsx60", laboratory: "", priceMinor: 100 },
      {
        rowKey: "vitaminacnatuliv1000mgsobresx15",
        laboratory: "",
        priceMinor: 200,
      },
    ];
    const read = jest.fn().mockResolvedValue(rows);
    service["remediesRows"] = read;

    const found = await service["recoverRemediesRows"](
      "https://preciosderemedios.com.ar/result/?busqueda=vita&combo=Asc%C3%B3rbico+%C3%A1cido",
      [
        {
          name: "VITAMINA C CALIHEPAT+",
          sourceRowKey: "vitaminaccalihepatcapsx60",
        } as CatalogItemForRefresh,
        {
          name: "VITAMINA C NATULIV",
          sourceRowKey: "vitaminacnatuliv1000mgsobresx15",
        } as CatalogItemForRefresh,
      ],
    );

    expect(read).toHaveBeenCalledTimes(1);
    expect(new URL(read.mock.calls[0][0]).searchParams.get("busqueda")).toBe(
      "vitamina c",
    );
    expect(new URL(read.mock.calls[0][0]).searchParams.get("combo")).toBe(
      "Ascórbico ácido",
    );
    expect(found).toEqual(rows);
  });

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

describe("carga de productos pendientes", () => {
  const pendiente = (externalKey: string) => ({
    kind: "pending" as const,
    externalKey,
    name: "CREMA",
    presentation: "x 30 g",
    activeIngredient: "",
    laboratory: "Elea",
    pharmaceuticalForm: "Crema",
    saleCondition: "Venta Libre",
    barcodes: ["7790001000011", "7790001000011"],
    reason: "no está en Remedios",
  });
  const producto = {
    kind: "product" as const,
    externalKey: "ab-2",
    name: "CREMA",
    presentation: "x 30 g",
    activeIngredient: "",
    laboratory: "Elea",
    pharmaceuticalForm: "Crema",
    saleCondition: "Venta Libre",
    troquel: "",
    priceSource: "official",
    priceMinor: 1000,
    referenceUrl: null,
    sourceRow: "",
    officialDelisted: false,
    laboratoryMismatch: null,
    barcodes: [],
  };
  const armar = (existentes: string[]) => {
    const tx = {
      medicineCatalogItem: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            existentes.map((externalKey) => ({ externalKey })),
          ),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      medicineCatalogBarcode: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      medicineLaboratoryAlias: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      medicineCatalogPending: {
        createMany: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown[] }) =>
            Promise.resolve({ count: data.length }),
          ),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    } as unknown as PrismaService;
    return {
      tx,
      service: new MedicineCatalogService(prisma, {} as AlfaBetaService),
    };
  };

  it("guarda el pendiente sin crearlo como referencia", async () => {
    const { tx, service } = armar([]);
    const result = await service.importRecords([pendiente("ab-1")]);
    expect(tx.medicineCatalogItem.createMany).not.toHaveBeenCalled();
    expect(tx.medicineCatalogPending.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          externalKey: "ab-1",
          barcodes: ["7790001000011"],
          reason: "no está en Remedios",
        }),
      ],
      skipDuplicates: true,
    });
    expect(result.pending).toBe(1);
  });

  it("no guarda como pendiente lo que ya está en la base", async () => {
    const { tx, service } = armar(["ab-1"]);
    await service.importRecords([pendiente("ab-1")]);
    expect(tx.medicineCatalogPending.createMany).not.toHaveBeenCalled();
  });

  it("saca de pendientes lo que consiguió precio y link", async () => {
    const { tx, service } = armar([]);
    await service.importRecords([producto]);
    expect(tx.medicineCatalogPending.deleteMany).toHaveBeenCalledWith({
      where: { externalKey: { in: ["ab-2"] } },
    });
  });

  it("corrige los enlaces amplios al cargar una base nueva", async () => {
    const { tx, service } = armar([]);
    await service.importRecords([
      {
        ...producto,
        priceSource: "preciosderemedios",
        referenceUrl:
          "https://preciosderemedios.com.ar/result/?busqueda=vita&combo=Asc%C3%B3rbico+%C3%A1cido",
      },
    ]);

    expect(tx.medicineCatalogItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          referenceUrl:
            "https://preciosderemedios.com.ar/result/?busqueda=vitamina+c&combo=Asc%C3%B3rbico+%C3%A1cido",
        }),
      ],
    });
  });
});
