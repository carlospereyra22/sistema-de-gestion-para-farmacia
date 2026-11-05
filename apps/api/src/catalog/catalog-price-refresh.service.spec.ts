import { Prisma } from "@prisma/client";
import {
  CatalogPriceRefreshService,
  nextArgentinaPriceRefresh,
  runLimited,
} from "./catalog-price-refresh.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlfaBetaService } from "./alfabeta.service";
import { MedicineCatalogService } from "./medicine-catalog.service";
import { MedicineReferenceService } from "./medicine-reference.service";
import { snapshotRow } from "./medicine-reference-snapshot";

function official(overrides: Record<string, unknown> = {}) {
  return {
    source: "official" as const,
    name: "ACTRON 400",
    presentation: "cáps. x 10",
    laboratory: "Bayer",
    activeIngredient: "ibuprofeno",
    barcode: "7793640215479",
    troquel: "",
    priceMinor: 900000,
    pamiPriceMinor: null,
    updatedAt: null,
    saleType: "",
    ...overrides,
  };
}

function setup() {
  const product = {
    priceDivisor: null as number | null,
    priceMarkupBps: 0,
    id: "product",
    organizationId: "org",
    active: true,
    saleUnit: "BOX",
    externalReferenceSource: "alfabeta",
    externalReferenceName: "ACTRON 400",
    externalReferencePresentation: "cáps. x 10",
    externalReferenceBarcode: null as string | null,
    externalReferencePriceMinor: 800000n as bigint | null,
    prices: [{ amountMinor: 800000n }],
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    product: {
      findUnique: jest.fn().mockImplementation(async () => product),
      update: jest.fn().mockResolvedValue({}),
    },
    priceList: { upsert: jest.fn().mockResolvedValue({ id: "general" }) },
    productPrice: {
      findUnique: jest
        .fn()
        .mockImplementation(async () => product.prices[0] ?? null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    priceRefreshChange: { create: jest.fn().mockResolvedValue({}) },
    medicineReferenceSnapshot: {
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
  };
  const snapshot: ReturnType<typeof snapshotRow>[] = [];
  const prisma = {
    product: {
      findMany: jest.fn().mockImplementation(async () => [product]),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    priceRefreshRun: {
      create: jest.fn().mockResolvedValue({ id: "run" }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    medicineReferenceSnapshot: {
      findMany: jest.fn().mockImplementation(async () => snapshot),
      count: jest.fn().mockResolvedValue(0),
    },
    platformSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(
      async (operation: (transaction: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };
  const alfabeta = {
    search: jest
      .fn()
      .mockResolvedValue([
        { id: "actron.html", name: "ACTRON 400", laboratory: "Bayer" },
      ]),
    detail: jest.fn().mockResolvedValue({
      name: "ACTRON 400",
      presentations: [
        {
          presentation: "cáps. x 10",
          priceMinor: 880000,
          updatedAt: "12/09/26",
        },
        {
          presentation: "cáps. x 20",
          priceMinor: 1500000,
          updatedAt: "12/09/26",
        },
      ],
    }),
  };
  const downloadOfficial = jest.fn().mockResolvedValue([official()]);
  const references = {
    search: jest.fn(),
    downloadOfficial,
    downloadOfficialData: jest.fn(async () => ({
      references: (await downloadOfficial()) as unknown[],
      payload: [{ CLAVE: 1 }],
    })),
  };
  const emptySource = {
    links: 0,
    failedLinks: 0,
    updated: 0,
    unchanged: 0,
    missing: 0,
    review: 0,
    stopped: false,
  };
  const catalog = {
    refreshOfficial: jest.fn().mockResolvedValue({ updated: 0, delisted: 0 }),
    refreshLinkedSources: jest
      .fn()
      .mockResolvedValue({ remedies: emptySource, alfabeta: emptySource }),
    references: jest.fn().mockResolvedValue([]),
  };
  const audit = { recordInTransaction: jest.fn().mockResolvedValue(undefined) };
  const service = new CatalogPriceRefreshService(
    prisma as unknown as PrismaService,
    references as unknown as MedicineReferenceService,
    audit as unknown as AuditService,
    alfabeta as unknown as AlfaBetaService,
    catalog as unknown as MedicineCatalogService,
  );
  // La copia local devuelve lo que la descarga acaba de guardar.
  tx.medicineReferenceSnapshot.createMany.mockImplementation(
    async ({ data }: { data: ReturnType<typeof snapshotRow>[] }) => {
      snapshot.push(...data.map((row) => ({ ...row, id: "row" })));
      return {};
    },
  );
  tx.medicineReferenceSnapshot.deleteMany.mockImplementation(
    async ({ where }: { where: { source: string } }) => {
      for (let index = snapshot.length - 1; index >= 0; index -= 1)
        if (snapshot[index]!.source === where.source) snapshot.splice(index, 1);
      return {};
    },
  );
  return {
    service,
    product,
    tx,
    prisma,
    alfabeta,
    references,
    catalog,
    audit,
    snapshot,
  };
}

describe("corrida con la base de medicamentos", () => {
  const fromCatalog = (overrides: Record<string, unknown> = {}) =>
    official({
      source: "preciosderemedios",
      priceMinor: 880000,
      ...overrides,
    });

  it("toma el precio de la base sin salir a buscar por nombre", async () => {
    const { service, prisma, catalog, alfabeta, references } = setup();
    catalog.references.mockResolvedValue([fromCatalog()]);
    const result = await service.refreshAll();
    expect(result.updated).toBe(1);
    expect(alfabeta.search).not.toHaveBeenCalled();
    expect(references.search).not.toHaveBeenCalled();
    expect(prisma.product.findMany).toHaveBeenCalled();
  });

  it("un vinculado al padrón dado de baja sigue con su otra fuente", async () => {
    const { service, product, catalog, tx } = setup();
    product.externalReferenceSource = "official";
    product.externalReferenceBarcode = "7793640215479";
    catalog.references.mockResolvedValue([fromCatalog()]);
    await service.refreshAll();
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalReferencePriceMinor: 880000n }),
      }),
    );
  });

  it("lo que no está en la base sigue con su fuente de siempre", async () => {
    const { service, alfabeta } = setup();
    await service.refreshAll();
    expect(alfabeta.search).toHaveBeenCalledWith("ACTRON 400");
  });

  it("actualiza la base con el padrón completo y registra el resultado", async () => {
    const { service, catalog, prisma } = setup();
    await service.refreshAll();
    expect(catalog.refreshOfficial).toHaveBeenCalledWith([{ CLAVE: 1 }]);
    expect(catalog.refreshLinkedSources).toHaveBeenCalledTimes(1);
    expect(prisma.priceRefreshRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.stringContaining("Base de medicamentos"),
        }),
      }),
    );
  });

  it("si el padrón cae, Remedios y AlfaBeta se leen igual", async () => {
    const { service, catalog, references } = setup();
    references.downloadOfficial.mockRejectedValue(new Error("caído"));
    await service.refreshAll();
    expect(catalog.refreshOfficial).not.toHaveBeenCalled();
    expect(catalog.refreshLinkedSources).toHaveBeenCalledTimes(1);
  });

  it("una respuesta parcial del padrón no toca la base", async () => {
    const { service, catalog, prisma, references } = setup();
    prisma.medicineReferenceSnapshot.count.mockResolvedValue(1000);
    references.downloadOfficial.mockResolvedValue([official()]);
    await service.refreshAll();
    expect(catalog.refreshOfficial).not.toHaveBeenCalled();
    expect(catalog.refreshLinkedSources).toHaveBeenCalledTimes(1);
  });

  it("un error de la base no frena la actualización de productos", async () => {
    const { service, catalog, alfabeta, prisma } = setup();
    catalog.refreshLinkedSources.mockRejectedValue(new Error("sin base"));
    const result = await service.refreshAll();
    expect(result.skipped).toBe(false);
    expect(alfabeta.search).toHaveBeenCalled();
    expect(prisma.priceRefreshRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PARTIAL" }),
      }),
    );
  });

  it("no informa éxito si una fuente dejó enlaces sin consultar", async () => {
    const { service, catalog, prisma } = setup();
    catalog.refreshLinkedSources.mockResolvedValue({
      remedies: {
        links: 5,
        failedLinks: 1,
        updated: 0,
        unchanged: 4,
        missing: 0,
        review: 0,
        stopped: false,
      },
      alfabeta: {
        links: 0,
        failedLinks: 0,
        updated: 0,
        unchanged: 0,
        missing: 0,
        review: 0,
        stopped: false,
      },
    });
    await service.refreshAll();
    expect(prisma.priceRefreshRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PARTIAL" }),
      }),
    );
  });

  it("la corrida de una farmacia no descarga ni lee fuentes", async () => {
    const { service, catalog } = setup();
    await service.refreshAll("org");
    expect(catalog.refreshOfficial).not.toHaveBeenCalled();
    expect(catalog.refreshLinkedSources).not.toHaveBeenCalled();
    expect(catalog.references).toHaveBeenCalledTimes(1);
  });
});

describe("linked product sale price refresh", () => {
  it("automatically updates fractional blisters with the current divisor and markup", async () => {
    const { service, product, tx } = setup();
    product.saleUnit = "BLISTER";
    product.priceDivisor = 2;
    product.priceMarkupBps = 1000;
    await service.refreshAll("org");
    expect(tx.productPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { amountMinor: 484000n } }),
    );
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalReferencePriceMinor: 880000n }),
      }),
    );
    tx.productPrice.upsert.mockClear();
    product.priceDivisor = 4;
    await service.refreshAll("org");
    expect(tx.productPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { amountMinor: 242000n } }),
    );
  });
  it("updates the actual general price, reference, audit and run change in one transaction", async () => {
    const { service, tx, prisma, audit } = setup();
    expect(await service.refreshAll("org")).toEqual({
      checked: 1,
      updated: 1,
      skipped: false,
      runId: "run",
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org", active: true }),
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.productPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId_priceListId: {
            productId: "product",
            priceListId: "general",
          },
        },
        update: { amountMinor: 880000n },
      }),
    );
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalReferencePriceMinor: 880000n,
          externalReferenceUpdatedAt: new Date("2026-09-12T00:00:00Z"),
        }),
      }),
    );
    expect(audit.recordInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "PRODUCT_PRICE_SYNCED",
        before: { amountMinor: "800000" },
        after: expect.objectContaining({ runId: "run" }),
      }),
    );
    expect(tx.priceRefreshChange.create).toHaveBeenCalledWith({
      data: {
        runId: "run",
        organizationId: "org",
        productId: "product",
        priceListId: "general",
        beforeAmountMinor: 800000n,
        afterAmountMinor: 880000n,
        beforeReferenceMinor: 800000n,
        afterReferenceMinor: 880000n,
      },
    });
  });
  it("repairs a sale price even when the saved reference already has the new value", async () => {
    const { service, product, tx } = setup();
    product.externalReferencePriceMinor = 880000n;
    await service.refreshAll();
    expect(tx.productPrice.upsert).toHaveBeenCalledTimes(1);
  });
  it("no abre transacción para un precio ya sincronizado y sólo marca la revisión", async () => {
    const { service, product, prisma, audit } = setup();
    product.externalReferencePriceMinor = 880000n;
    product.prices = [{ amountMinor: 880000n }];
    expect((await service.refreshAll()).updated).toBe(0);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(audit.recordInTransaction).not.toHaveBeenCalled();
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["product"] } },
      data: { externalReferenceCheckedAt: expect.any(Date) },
    });
  });
  it("also applies a lower source price without a percentage calculation", async () => {
    const { service, product, tx } = setup();
    product.prices = [{ amountMinor: 1000000n }];
    await service.refreshAll();
    expect(tx.productPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { amountMinor: 880000n } }),
    );
  });
  it("does not substitute another presentation of the same medicine", async () => {
    const { service, product, tx } = setup();
    product.externalReferencePresentation = "cáps. x 30";
    await service.refreshAll("org");
    expect(tx.product.update).not.toHaveBeenCalled();
  });
  it("rejects ambiguous medicine names", async () => {
    const { service, alfabeta, tx } = setup();
    alfabeta.search.mockResolvedValue([
      { id: "a.html", name: "ACTRON 400" },
      { id: "b.html", name: "ACTRON 400" },
    ]);
    await service.refreshAll("org");
    expect(alfabeta.detail).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });
  it.each([null, 0, -1, NaN])(
    "preserves prices for invalid source amount %s",
    async (priceMinor) => {
      const { service, alfabeta, tx } = setup();
      alfabeta.detail.mockResolvedValue({
        name: "ACTRON 400",
        presentations: [
          { presentation: "cáps. x 10", priceMinor, updatedAt: null },
        ],
      });
      await service.refreshAll("org");
      expect(tx.product.update).not.toHaveBeenCalled();
    },
  );
  it("preserves prices when the source is unavailable", async () => {
    const { service, alfabeta, tx, prisma } = setup();
    alfabeta.search.mockRejectedValue(new Error("unavailable"));
    await service.refreshAll("org");
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(prisma.priceRefreshRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PARTIAL", failed: 1 }),
      }),
    );
  });
  it.each(["BLISTER", "UNIT"])(
    "does not apply package prices to %s",
    async (saleUnit) => {
      const { service, product, tx } = setup();
      product.saleUnit = saleUnit;
      await service.refreshAll("org");
      expect(tx.productPrice.upsert).not.toHaveBeenCalled();
      expect(tx.product.update).toHaveBeenCalled();
    },
  );
  it("skips a product whose binding changed during the external request", async () => {
    const { service, product, tx } = setup();
    tx.product.findUnique.mockResolvedValue({
      ...product,
      externalReferencePresentation: "cáps. x 20",
    });
    await service.refreshAll("org");
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.productPrice.upsert).not.toHaveBeenCalled();
  });
  it("skips products deactivated during the external request", async () => {
    const { service, product, tx } = setup();
    tx.product.findUnique.mockResolvedValue({ ...product, active: false });
    await service.refreshAll("org");
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});

describe("copia local del padrón (SISTEMA-21)", () => {
  it("descarga el padrón una sola vez y actualiza desde la copia local", async () => {
    const { service, product, references, tx, snapshot } = setup();
    product.externalReferenceSource = "official";
    product.externalReferenceBarcode = "07793640215479";
    await service.refreshAll(undefined, "SCHEDULED");
    expect(references.downloadOfficial).toHaveBeenCalledTimes(1);
    expect(references.search).not.toHaveBeenCalled();
    expect(snapshot).toHaveLength(1);
    expect(tx.productPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { amountMinor: 900000n } }),
    );
  });
  it("la corrida de una farmacia no descarga el padrón", async () => {
    const { service, product, references, prisma } = setup();
    product.externalReferenceSource = "official";
    await service.refreshAll("org");
    expect(references.downloadOfficial).not.toHaveBeenCalled();
    expect(prisma.priceRefreshRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: "org",
          trigger: "ORGANIZATION",
          status: "RUNNING",
        },
      }),
    );
  });
  it("aborta sin tocar precios ni la copia si el padrón responde parcial", async () => {
    const { service, product, references, prisma, tx } = setup();
    product.externalReferenceSource = "official";
    prisma.medicineReferenceSnapshot.count.mockResolvedValue(16000);
    references.downloadOfficial.mockResolvedValue([official()]);
    await service.refreshAll(undefined, "SCHEDULED");
    expect(tx.medicineReferenceSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(prisma.priceRefreshRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ABORTED", snapshotRows: 1 }),
      }),
    );
  });
  it("si el padrón no responde conserva la copia anterior", async () => {
    const { service, references, tx } = setup();
    references.downloadOfficial.mockRejectedValue(new Error("caído"));
    await service.refreshAll(undefined, "SCHEDULED");
    expect(tx.medicineReferenceSnapshot.deleteMany).not.toHaveBeenCalledWith({
      where: { source: "official" },
    });
  });
  it("en pausa descarga el padrón pero no cambia precios", async () => {
    const { service, prisma, tx, references } = setup();
    prisma.platformSetting.findUnique.mockResolvedValue({ value: true });
    await service.refreshAll(undefined, "SCHEDULED");
    expect(references.downloadOfficial).toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(prisma.priceRefreshRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAUSED" }),
      }),
    );
  });
  it("busca una sola vez un medicamento que tienen varias farmacias", async () => {
    const { service, product, prisma, alfabeta } = setup();
    prisma.product.findMany.mockResolvedValue([
      product,
      { ...product, id: "other", organizationId: "other-org" },
    ]);
    await service.refreshAll(undefined, "SCHEDULED");
    expect(alfabeta.search).toHaveBeenCalledTimes(1);
  });
  it("omite la corrida si otra instancia ya tiene una global en curso", async () => {
    const { service, prisma, references } = setup();
    prisma.priceRefreshRun.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    expect(await service.refreshAll(undefined, "SCHEDULED")).toEqual(
      expect.objectContaining({ skipped: true }),
    );
    expect(references.downloadOfficial).not.toHaveBeenCalled();
  });
});

describe("deshacer una corrida", () => {
  function change(overrides: Record<string, unknown> = {}) {
    return {
      productId: "product",
      organizationId: "org",
      priceListId: "general",
      beforeAmountMinor: 800000n,
      afterAmountMinor: 880000n,
      beforeReferenceMinor: 800000n,
      afterReferenceMinor: 880000n,
      ...overrides,
    };
  }
  it("restaura los precios anteriores y lo audita", async () => {
    const { service, prisma, product, tx, audit } = setup();
    product.externalReferencePriceMinor = 880000n;
    product.prices = [{ amountMinor: 880000n }];
    prisma.priceRefreshRun.findUnique.mockResolvedValue({
      id: "run",
      changes: [change()],
    });
    expect(await service.revertRun(null, "run")).toEqual({
      runId: "run",
      changes: 1,
      reverted: 1,
      kept: [],
    });
    expect(tx.productPrice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amountMinor: 800000n } }),
    );
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { externalReferencePriceMinor: 800000n },
      }),
    );
    expect(audit.recordInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "PRODUCT_PRICE_SYNC_REVERTED" }),
    );
  });
  it("no pisa un precio cambiado a mano después de la corrida", async () => {
    const { service, prisma, product, tx } = setup();
    product.externalReferencePriceMinor = 880000n;
    product.prices = [{ amountMinor: 950000n }];
    prisma.priceRefreshRun.findUnique.mockResolvedValue({
      id: "run",
      changes: [change()],
    });
    expect((await service.revertRun(null, "run")).kept).toEqual(["product"]);
    expect(tx.productPrice.update).not.toHaveBeenCalled();
  });
});

describe("runLimited", () => {
  it("no supera la cantidad de tareas simultáneas", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
    await runLimited(tasks, 2);
    expect(peak).toBe(2);
  });
});

describe("catalog price refresh schedule", () => {
  it("schedules the morning run at 09:00 in Argentina", () => {
    expect(
      nextArgentinaPriceRefresh(new Date("2026-09-08T11:59:00.000Z")),
    ).toEqual(new Date("2026-09-08T12:00:00.000Z"));
  });

  it("schedules the afternoon run at 17:00 in Argentina", () => {
    expect(
      nextArgentinaPriceRefresh(new Date("2026-09-08T12:01:00.000Z")),
    ).toEqual(new Date("2026-09-08T20:00:00.000Z"));
  });

  it("moves to the following morning after the afternoon run", () => {
    expect(
      nextArgentinaPriceRefresh(new Date("2026-09-08T20:01:00.000Z")),
    ).toEqual(new Date("2026-09-09T12:00:00.000Z"));
  });
});
