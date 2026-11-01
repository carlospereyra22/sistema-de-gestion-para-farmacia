import { CatalogService } from "./catalog.service";
import type { PrismaService } from "../prisma/prisma.service";

function setup() {
  const before = {
    id: "product",
    organizationId: "org",
    isMedication: true,
    brand: null,
    externalReferenceSource: "official",
    externalReferenceName: "Crema",
    externalReferencePriceMinor: 5000n,
    priceDivisor: null,
    saleUnit: "BOX",
    prescriptionRequired: false,
  };
  const update = jest
    .fn()
    .mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...before,
        ...data,
      }),
    );
  const tx = {
    product: {
      findFirstOrThrow: jest.fn().mockResolvedValue(before),
      findFirst: jest.fn().mockResolvedValue(before),
      update,
    },
    productBarcode: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    product: { findFirst: jest.fn().mockResolvedValue(before) },
    $transaction: jest.fn(
      async (operation: (value: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };
  const service = new CatalogService(prisma as unknown as PrismaService);
  jest.spyOn(service, "assertPermission").mockResolvedValue(undefined);
  return { service, tx, prisma };
}
it("generates the internal code only when requested in the product save transaction", async () => {
  const { service, tx, prisma } = setup();
  await service.updateProduct("actor", "org", "product", {
    name: "Nuevo nombre",
  });
  expect(tx.productBarcode.create).not.toHaveBeenCalled();
  await service.updateProduct("actor", "org", "product", {
    generateInternalBarcode: true,
  });
  expect(tx.productBarcode.create).toHaveBeenCalledWith({
    data: {
      productId: "product",
      code: expect.stringMatching(/^SG\d{12}$/),
      primary: false,
    },
  });
  expect(prisma.$transaction).toHaveBeenCalledTimes(2);
});
it("does not commit an edit if its requested internal code collides", async () => {
  const { service, tx } = setup();
  tx.productBarcode.findUnique.mockResolvedValue({ productId: "other" });
  await expect(
    service.updateProduct("actor", "org", "product", {
      name: "Nuevo nombre",
      generateInternalBarcode: true,
    }),
  ).rejects.toThrow("único");
});
it("rejects a non-medication linked to a medicinal source before creating anything", async () => {
  const { service, prisma } = setup();
  await expect(
    service.create("actor", "org", {
      name: "Crema",
      priceMinor: 5000,
      isMedication: false,
      externalReferenceSource: "official",
    }),
  ).rejects.toThrow("Es medicamento");
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("rejects a medicinal reference with a different scanned EAN before creating a product", async () => {
  const { service, prisma } = setup();
  await expect(
    service.create("actor", "org", {
      name: "IBU 400",
      priceMinor: 590000,
      barcode: "7798420160383",
      isMedication: true,
      externalReferenceSource: "official",
      externalReferenceBarcode: "7790839980590",
    }),
  ).rejects.toThrow("no coincide");
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("detaches a misclassified product and records its brand without changing its price", async () => {
  const { service, tx } = setup();
  await service.updateProduct("actor", "org", "product", {
    isMedication: false,
    brand: "  Dermaglós   Solar  ",
  });
  expect(tx.product.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        isMedication: false,
        brand: "Dermaglós Solar",
        prescriptionRequired: false,
        externalReferenceSource: null,
        externalReferenceName: null,
        externalReferencePriceMinor: null,
        externalReferenceCheckedAt: null,
      }),
    }),
  );
  expect(tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: "PRODUCT_CLASSIFICATION_UPDATED",
      }),
    }),
  );
});
it("rejects prescription or medicinal linking for an explicitly non-medicinal product", async () => {
  const { service, tx } = setup();
  await expect(
    service.updateProduct("actor", "org", "product", {
      isMedication: false,
      prescriptionRequired: true,
    }),
  ).rejects.toThrow("Es medicamento");
  expect(tx.product.update).not.toHaveBeenCalled();
});
