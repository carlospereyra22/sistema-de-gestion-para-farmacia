import {
  PriceListUpdates,
  increasedPrice,
  PriceChangesDto,
} from "./price-list-updates";
import type { PrismaService } from "../prisma/prisma.service";
import type { CatalogService } from "./catalog.service";

function setup(name = "Convenios") {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    priceList: {
      findFirst: jest.fn().mockResolvedValue({ id: "list", name }),
      update: jest.fn(),
    },
    product: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn() },
    customer: { findFirst: jest.fn() },
    productPrice: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ productId: "p", amountMinor: 1000n }]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    auditLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const catalog = { assertPermission: jest.fn() };
  return {
    tx,
    prisma,
    catalog,
    service: new PriceListUpdates(
      prisma as unknown as PrismaService,
      catalog as unknown as CatalogService,
    ),
  };
}
const input: PriceChangesDto = {
  requestId: "req",
  changes: [{ productId: "p", expectedMinor: "1000", amountMinor: "1100" }],
};
it("computes percentage and fixed increases in integer minor units", () => {
  expect(increasedPrice(1000n, "PERCENT", 800)).toBe(1080n);
  expect(increasedPrice(105n, "PERCENT", 1000)).toBe(116n);
  expect(increasedPrice(1000n, "FIXED", 250)).toBe(1250n);
  expect(() => increasedPrice(999999999999n, "FIXED", 1)).toThrow();
  expect(increasedPrice(1000n, "PERCENT", 0)).toBe(1000n);
});
it("supports reductions, rounds cents and rejects negative final prices", () => {
  expect(increasedPrice(1000n, "PERCENT", -500)).toBe(950n);
  expect(increasedPrice(105n, "PERCENT", -1000)).toBe(95n);
  expect(increasedPrice(100000n, "FIXED", -50000)).toBe(50000n);
  expect(increasedPrice(1000n, "PERCENT", -10000)).toBe(0n);
  expect(() => increasedPrice(1000n, "PERCENT", -10001)).toThrow("100%");
  expect(() => increasedPrice(1000n, "FIXED", -1001)).toThrow("negativo");
  expect(() => increasedPrice(1000n, "FIXED", Number.NaN)).toThrow();
});
it("protects the general list server side", async () => {
  const { service, tx } = setup("Precio general");
  await expect(service.save("actor", "org", "list", input)).rejects.toThrow(
    "solo lectura",
  );
  expect(tx.productPrice.upsert).not.toHaveBeenCalled();
});
it("checks scope, permission, stale prices and duplicates before any update", async () => {
  const { service, tx, catalog } = setup();
  await expect(
    service.save("actor", "org", "list", {
      ...input,
      changes: [...input.changes, ...input.changes],
    }),
  ).rejects.toThrow("repetidos");
  tx.productPrice.findMany.mockResolvedValue([
    { productId: "p", amountMinor: 2000n },
  ]);
  await expect(service.save("actor", "org", "list", input)).rejects.toThrow(
    "cambiaron",
  );
  expect(catalog.assertPermission).toHaveBeenCalledWith(
    "actor",
    "org",
    "CATALOG_MANAGE",
  );
  expect(tx.priceList.findFirst).toHaveBeenCalledWith({
    where: { id: "list", organizationId: "org", active: true },
  });
  expect(tx.productPrice.upsert).not.toHaveBeenCalled();
  tx.product.count.mockResolvedValue(0);
  await expect(service.save("actor", "org", "list", input)).rejects.toThrow(
    "ajenos",
  );
});
it("saves and audits within a transaction, then ignores an identical retry", async () => {
  const { service, tx, prisma } = setup();
  await service.save("actor", "org", "list", input);
  expect(prisma.$transaction).toHaveBeenCalled();
  expect(tx.productPrice.upsert).toHaveBeenCalledTimes(1);
  const saved = tx.auditLog.create.mock.calls[0]?.[0] as {
    data: { after: object };
  };
  tx.auditLog.findFirst.mockResolvedValue({ after: saved.data.after });
  await expect(
    service.save("actor", "org", "list", input),
  ).resolves.toMatchObject({ repeated: true });
  expect(tx.productPrice.upsert).toHaveBeenCalledTimes(1);
  await expect(
    service.save("actor", "org", "list", {
      ...input,
      changes: [{ ...input.changes[0]!, amountMinor: "1200" }],
    }),
  ).rejects.toThrow("utilizado");
});
it("effective prices use custom prices including zero, falling back per product", async () => {
  const { service, tx } = setup();
  tx.customer.findFirst.mockResolvedValue({ priceListId: "custom" });
  tx.priceList.findFirst
    .mockResolvedValueOnce({ id: "general", name: "Precio general" })
    .mockResolvedValueOnce({ id: "custom", name: "Convenios" });
  tx.product.findMany.mockResolvedValue([
    {
      id: "p",
      prices: [
        { priceListId: "general", amountMinor: 1000n },
        { priceListId: "custom", amountMinor: 0n },
      ],
    },
    { id: "q", prices: [{ priceListId: "general", amountMinor: 500n }] },
    { id: "r", prices: [] },
  ]);
  expect(await service.effective("actor", "org", "client")).toEqual({
    listName: "Convenios",
    prices: [
      { productId: "p", amountMinor: "0", source: "Convenios" },
      { productId: "q", amountMinor: "500", source: "Precio general" },
      { productId: "r", amountMinor: null, source: "Precio general" },
    ],
  });
});
it("handles unpriced products without a customer or custom list", async () => {
  const { service, tx } = setup();
  tx.product.findMany.mockResolvedValue([{ id: "p", prices: [] }]);
  expect((await service.effective("actor", "org")).prices).toEqual([
    { productId: "p", amountMinor: null, source: "Precio general" },
  ]);
});
