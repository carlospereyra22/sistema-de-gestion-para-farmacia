import type { Prisma } from "@prisma/client";
import {
  addEquivalentBarcode,
  gtinSpellings,
  MAX_EQUIVALENT_BARCODES,
  removeEquivalentBarcode,
} from "./equivalent-barcode";

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    product: {
      findFirst: jest.fn().mockResolvedValue({ id: "product", name: "Actron" }),
    },
    productBarcode: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { tx, client: tx as unknown as Prisma.TransactionClient };
}

describe("códigos equivalentes", () => {
  it("considera el mismo GTIN con o sin ceros a la izquierda", () => {
    expect(gtinSpellings("7793640215509")).toEqual([
      "07793640215509",
      "7793640215509",
    ]);
    expect(gtinSpellings("07793640215509")).toEqual([
      "07793640215509",
      "7793640215509",
    ]);
  });

  it("rechaza un código que no es un GTIN válido", () => {
    expect(() => gtinSpellings("7793640215508")).toThrow("Dígito de control");
    expect(() => gtinSpellings("ABC")).toThrow("GTIN");
  });

  it("asocia un EAN importado al producto y lo audita", async () => {
    const { tx, client } = setup();
    await expect(
      addEquivalentBarcode(
        client,
        "actor",
        "org",
        "product",
        " 4006381333931 ",
      ),
    ).resolves.toEqual({
      productId: "product",
      productName: "Actron",
      code: "4006381333931",
    });
    expect(tx.productBarcode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org",
          code: { in: ["04006381333931", "4006381333931"] },
        },
      }),
    );
    expect(tx.productBarcode.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org",
        productId: "product",
        code: "4006381333931",
        primary: false,
        kind: "EQUIVALENT",
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PRODUCT_EQUIVALENT_BARCODE_ADDED",
        organizationId: "org",
        entityId: "product",
      }),
    });
  });

  it("bloquea un código que ya es de otro producto de la organización", async () => {
    const { tx, client } = setup();
    tx.productBarcode.findFirst.mockResolvedValue({
      productId: "other",
      product: { name: "Ibupirac" },
    });
    await expect(
      addEquivalentBarcode(client, "actor", "org", "product", "4006381333931"),
    ).rejects.toThrow("“Ibupirac”");
    expect(tx.productBarcode.create).not.toHaveBeenCalled();
  });

  it("no repite un código que el producto ya tiene", async () => {
    const { tx, client } = setup();
    tx.productBarcode.findFirst.mockResolvedValue({
      productId: "product",
      product: { name: "Actron" },
    });
    await expect(
      addEquivalentBarcode(client, "actor", "org", "product", "4006381333931"),
    ).rejects.toThrow("ya es un código de este producto");
  });

  it("limita la cantidad de equivalentes por producto", async () => {
    const { tx, client } = setup();
    tx.productBarcode.count.mockResolvedValue(MAX_EQUIVALENT_BARCODES);
    await expect(
      addEquivalentBarcode(client, "actor", "org", "product", "4006381333931"),
    ).rejects.toThrow(`hasta ${MAX_EQUIVALENT_BARCODES}`);
  });

  it("no opera sobre un producto de otra organización o archivado", async () => {
    const { tx, client } = setup();
    tx.product.findFirst.mockResolvedValue(null);
    await expect(
      addEquivalentBarcode(client, "actor", "org", "product", "4006381333931"),
    ).rejects.toThrow("Producto no disponible");
    expect(tx.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product", organizationId: "org", active: true },
      }),
    );
  });

  it("quita solo códigos equivalentes del producto y lo audita", async () => {
    const { tx, client } = setup();
    tx.productBarcode.findFirst.mockResolvedValue({ id: "barcode" });
    await removeEquivalentBarcode(
      client,
      "actor",
      "org",
      "product",
      "4006381333931",
    );
    expect(tx.productBarcode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org",
          productId: "product",
          code: "4006381333931",
          kind: "EQUIVALENT",
        },
      }),
    );
    expect(tx.productBarcode.delete).toHaveBeenCalledWith({
      where: { id: "barcode" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PRODUCT_EQUIVALENT_BARCODE_REMOVED",
      }),
    });
  });

  it("no quita el código principal ni el interno", async () => {
    const { tx, client } = setup();
    await expect(
      removeEquivalentBarcode(
        client,
        "actor",
        "org",
        "product",
        "SG000000000001",
      ),
    ).rejects.toThrow("no existe");
    expect(tx.productBarcode.delete).not.toHaveBeenCalled();
  });
});
