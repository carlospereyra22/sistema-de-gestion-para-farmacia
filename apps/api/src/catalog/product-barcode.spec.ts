import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { withProductBarcode } from "./product-barcode";

function setup() {
  const lookup = jest.fn();
  const prisma = { productBarcode: { findFirst: lookup } } as unknown as Pick<
    PrismaService,
    "productBarcode"
  >;
  const operation = jest.fn().mockResolvedValue({ id: "saved" });
  return { lookup, prisma, operation };
}
describe("product barcode conflicts", () => {
  it("rejects a duplicate before writing and identifies the product in the same organization", async () => {
    const { prisma, lookup, operation } = setup();
    lookup.mockResolvedValue({
      productId: "other",
      product: { name: "ACTRON RAPIDA ACCION" },
    });
    await expect(
      withProductBarcode(
        prisma,
        "org",
        "editing",
        " 7793640992769 ",
        operation,
      ),
    ).rejects.toThrow(
      "El código de barras 7793640992769 ya está asignado al producto “ACTRON RAPIDA ACCION”",
    );
    expect(operation).not.toHaveBeenCalled();
  });
  it("busca solo en la organización, con el GTIN con o sin ceros y sin el producto editado", async () => {
    const { prisma, lookup, operation } = setup();
    lookup.mockResolvedValue(null);
    await withProductBarcode(
      prisma,
      "org",
      "editing",
      "7793640992769",
      operation,
    );
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org",
          code: { in: ["07793640992769", "7793640992769"] },
          productId: { not: "editing" },
        },
      }),
    );
  });
  it("compara tal cual un código propio que no es GTIN", async () => {
    const { prisma, lookup, operation } = setup();
    lookup.mockResolvedValue(null);
    await withProductBarcode(prisma, "org", undefined, "INT-123", operation);
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org", code: { in: ["INT-123"] } },
      }),
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, "", "  "])(
    "allows an optional barcode: %s",
    async (code) => {
      const { prisma, lookup, operation } = setup();
      await withProductBarcode(prisma, "org", undefined, code, operation);
      expect(lookup).not.toHaveBeenCalled();
      expect(operation).toHaveBeenCalledTimes(1);
    },
  );
  it("allows an unused barcode", async () => {
    const { prisma, lookup, operation } = setup();
    lookup.mockResolvedValue(null);
    await withProductBarcode(prisma, "org", undefined, "123", operation);
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("maps concurrent unique constraint failures to HTTP 409", async () => {
    const { prisma, lookup, operation } = setup();
    lookup.mockResolvedValueOnce(null).mockResolvedValueOnce({
      productId: "other",
      product: { name: "ACTRON" },
    });
    operation.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["organizationId", "code"] },
      }),
    );
    await expect(
      withProductBarcode(prisma, "org", undefined, "123", operation),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it("does not mislabel unrelated database errors as barcode conflicts", async () => {
    const { prisma, lookup, operation } = setup();
    lookup.mockResolvedValue(null);
    const failure = new Prisma.PrismaClientKnownRequestError(
      "other duplicate",
      { code: "P2002", clientVersion: "test", meta: { target: ["name"] } },
    );
    operation.mockRejectedValue(failure);
    await expect(
      withProductBarcode(prisma, "org", undefined, "123", operation),
    ).rejects.toBe(failure);
  });
});
