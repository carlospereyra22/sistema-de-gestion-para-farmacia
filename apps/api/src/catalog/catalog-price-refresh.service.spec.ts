import {
  CatalogPriceRefreshService,
  nextArgentinaPriceRefresh,
} from "./catalog-price-refresh.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlfaBetaService } from "./alfabeta.service";
import { MedicineReferenceService } from "./medicine-reference.service";

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
    externalReferenceBarcode: null,
    externalReferencePriceMinor: 800000n,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
      update: jest.fn().mockResolvedValue({}),
    },
    priceList: { upsert: jest.fn().mockResolvedValue({ id: "general" }) },
    productPrice: {
      findUnique: jest.fn().mockResolvedValue({ amountMinor: 800000n }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    product: { findMany: jest.fn().mockResolvedValue([product]) },
    $transaction: jest.fn(
      async (operation: (transaction: typeof tx) => Promise<boolean>) =>
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
  const references = { search: jest.fn() };
  const audit = { recordInTransaction: jest.fn().mockResolvedValue(undefined) };
  const service = new CatalogPriceRefreshService(
    prisma as unknown as PrismaService,
    references as unknown as MedicineReferenceService,
    audit as unknown as AuditService,
    alfabeta as unknown as AlfaBetaService,
  );
  return { service, product, tx, prisma, alfabeta, references, audit };
}

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
  it("updates the actual general price, reference and audit in one transaction", async () => {
    const { service, tx, prisma, audit } = setup();
    expect(await service.refreshAll("org")).toEqual({
      checked: 1,
      updated: 1,
      skipped: false,
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
      }),
    );
  });
  it("repairs a sale price even when the saved reference already has the new value", async () => {
    const { service, product, tx } = setup();
    product.externalReferencePriceMinor = 880000n;
    await service.refreshAll();
    expect(tx.productPrice.upsert).toHaveBeenCalledTimes(1);
  });
  it("does not rewrite a price already synchronized", async () => {
    const { service, product, tx, audit } = setup();
    product.externalReferencePriceMinor = 880000n;
    tx.productPrice.findUnique.mockResolvedValue({ amountMinor: 880000n });
    expect((await service.refreshAll()).updated).toBe(0);
    expect(tx.productPrice.upsert).not.toHaveBeenCalled();
    expect(audit.recordInTransaction).not.toHaveBeenCalled();
  });
  it("also applies a lower source price without a percentage calculation", async () => {
    const { service, tx } = setup();
    tx.productPrice.findUnique.mockResolvedValue({ amountMinor: 1000000n });
    await service.refreshAll();
    expect(tx.productPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { amountMinor: 880000n } }),
    );
  });
  it("does not substitute another presentation of the same medicine", async () => {
    const { service, product, prisma } = setup();
    product.externalReferencePresentation = "cáps. x 30";
    await service.refreshAll();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects ambiguous medicine names", async () => {
    const { service, alfabeta, prisma } = setup();
    alfabeta.search.mockResolvedValue([
      { id: "a.html", name: "ACTRON 400" },
      { id: "b.html", name: "ACTRON 400" },
    ]);
    await service.refreshAll();
    expect(alfabeta.detail).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([null, 0, -1, NaN])(
    "preserves prices for invalid source amount %s",
    async (priceMinor) => {
      const { service, alfabeta, prisma } = setup();
      alfabeta.detail.mockResolvedValue({
        name: "ACTRON 400",
        presentations: [
          { presentation: "cáps. x 10", priceMinor, updatedAt: null },
        ],
      });
      await service.refreshAll();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it("preserves prices when the source is unavailable", async () => {
    const { service, alfabeta, prisma } = setup();
    alfabeta.search.mockRejectedValue(new Error("unavailable"));
    await service.refreshAll();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(["BLISTER", "UNIT"])(
    "does not apply package prices to %s",
    async (saleUnit) => {
      const { service, product, tx } = setup();
      product.saleUnit = saleUnit;
      await service.refreshAll();
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
    await service.refreshAll();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.productPrice.upsert).not.toHaveBeenCalled();
  });
  it("skips products deactivated during the external request", async () => {
    const { service, product, tx } = setup();
    tx.product.findUnique.mockResolvedValue({ ...product, active: false });
    await service.refreshAll();
    expect(tx.product.update).not.toHaveBeenCalled();
  });
  it("continues using the saved provider of existing links", async () => {
    const { service, product, references, alfabeta, tx } = setup();
    product.externalReferenceSource = "official";
    references.search.mockResolvedValue([
      {
        source: "official",
        name: "ACTRON 400",
        presentation: "cáps. x 10",
        priceMinor: 900000,
        updatedAt: null,
      },
    ]);
    await service.refreshAll();
    expect(alfabeta.search).not.toHaveBeenCalled();
    expect(tx.productPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { amountMinor: 900000n } }),
    );
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
