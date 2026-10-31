import { decodeProductImage, saveProductImage } from "./product-image";
import { CatalogService } from "./catalog.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "@prisma/client";

function jpegHeader(width = 800, height = 600) {
  const header = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0, 0xff, 0xda, 0,
    8, 1, 1, 0, 0, 63, 0, 0xff, 0xd9,
  ]);
  header.writeUInt16BE(height, 7);
  header.writeUInt16BE(width, 9);
  return `data:image/jpeg;base64,${header.toString("base64")}`;
}
describe("product image validation and persistence", () => {
  it("accepts bounded JPEG dimensions", () => {
    expect(decodeProductImage(jpegHeader()).length).toBeGreaterThan(0);
  });
  it.each([
    "data:image/svg+xml;base64,PHN2Zz4=",
    "https://example.com/a.jpg",
    "data:image/jpeg;base64,aGVsbG8=",
    "data:image/png;base64,iVBORw==",
  ])("rejects unsafe or invalid data %s", (value) => {
    expect(() => decodeProductImage(value)).toThrow();
  });
  it("rejects excessive dimensions and payloads", () => {
    expect(() => decodeProductImage(jpegHeader(1025))).toThrow("1024");
    expect(() =>
      decodeProductImage("data:image/jpeg;base64," + "a".repeat(82000)),
    ).toThrow();
  });
  it("keeps omitted images and persists explicit replacements/removals with audit", async () => {
    const upsert = jest.fn();
    const deleteMany = jest.fn();
    const create = jest.fn();
    const tx = {
      productImage: { upsert, deleteMany },
      auditLog: { create },
    } as unknown as Prisma.TransactionClient;
    await saveProductImage(tx, "org", "product", "actor", undefined);
    expect(create).not.toHaveBeenCalled();
    await saveProductImage(
      tx,
      "org",
      "product",
      "actor",
      decodeProductImage(jpegHeader()),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          productId: "product",
          organizationId: "org",
        }),
      }),
    );
    await saveProductImage(tx, "org", "product", "actor", null);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { productId: "product", organizationId: "org" },
    });
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("reads only images of the requested organization after checking permissions", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ content: Buffer.from([1, 2]) });
    const service = new CatalogService({
      productImage: { findFirst },
    } as unknown as PrismaService);
    const permission = jest
      .spyOn(service, "assertPermission")
      .mockResolvedValue(undefined);
    await service.productImage("actor", "org", "product");
    expect(permission).toHaveBeenCalledWith("actor", "org", "CATALOG_READ");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId: "product",
          organizationId: "org",
          product: { organizationId: "org" },
        },
      }),
    );
    findFirst.mockClear();
    permission.mockRejectedValue(new Error("Denied"));
    await expect(
      service.productImage("actor", "other", "product"),
    ).rejects.toThrow("Denied");
    expect(findFirst).not.toHaveBeenCalled();
  });
});
