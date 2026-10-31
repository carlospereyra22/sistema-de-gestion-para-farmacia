import { CatalogService } from "./catalog.service";
import { internalBarcodeCode } from "./internal-barcode";
import type { PrismaService } from "../prisma/prisma.service";

function setup() {
  const tx = {
    product: {
      create: jest.fn().mockResolvedValue({ id: "product" }),
      findFirst: jest
        .fn()
        .mockResolvedValue({ name: "Producto", saleUnit: "UNIT" }),
    },
    priceList: { upsert: jest.fn().mockResolvedValue({ id: "list" }) },
    productPrice: { create: jest.fn().mockResolvedValue({}) },
    productBarcode: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    productBarcode: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (run: (value: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const service = new CatalogService(prisma as unknown as PrismaService);
  const permission = jest
    .spyOn(service, "assertPermission")
    .mockResolvedValue(undefined);
  return { service, tx, prisma, permission };
}

it("creates an optional secondary internal code alongside the original barcode and price in the same transaction", async () => {
  const { service, tx, prisma } = setup();
  await expect(
    service.create("actor", "org", {
      name: "Producto",
      priceMinor: 1200,
      barcode: "7798008191792",
      generateInternalBarcode: true,
    }),
  ).resolves.toEqual({ id: "product" });
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.productBarcode.create.mock.calls.map(([arg]) => arg.data)).toEqual([
    { productId: "product", code: "7798008191792", primary: true },
    {
      productId: "product",
      code: internalBarcodeCode("org", "product"),
      primary: false,
    },
  ]);
  expect(tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: "PRODUCT_INTERNAL_BARCODE_CREATED",
        organizationId: "org",
        actorId: "actor",
      }),
    }),
  );
});

it.each([false, undefined])(
  "does not generate a code unless requested (%s)",
  async (generateInternalBarcode) => {
    const { service, tx } = setup();
    await service.create("actor", "org", {
      name: "Producto",
      priceMinor: 0,
      generateInternalBarcode,
    });
    expect(tx.productBarcode.create).not.toHaveBeenCalled();
  },
);

it("propagates a code collision out of the creation transaction so the whole creation rolls back", async () => {
  const { service, tx } = setup();
  tx.productBarcode.findUnique.mockResolvedValue({ productId: "other" });
  await expect(
    service.create("actor", "org", {
      name: "Producto",
      priceMinor: 0,
      generateInternalBarcode: true,
    }),
  ).rejects.toThrow("único");
});

it("checks catalogue permissions before creating either the product or its code", async () => {
  const { service, prisma, permission } = setup();
  permission.mockRejectedValue(new Error("Denied"));
  await expect(
    service.create("actor", "org", {
      name: "Producto",
      priceMinor: 0,
      generateInternalBarcode: true,
    }),
  ).rejects.toThrow("Denied");
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
