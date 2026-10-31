import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { internalBarcode, internalBarcodeCode } from "./internal-barcode";
import { CatalogService } from "./catalog.service";
import { PrismaService } from "../prisma/prisma.service";

function setup() {
  const findFirst = jest
    .fn()
    .mockResolvedValue({ name: "Actron", saleUnit: "BLISTER" });
  const findUnique = jest.fn().mockResolvedValue(null);
  const create = jest.fn().mockResolvedValue({});
  const audit = jest.fn().mockResolvedValue({});
  const lock = jest.fn().mockResolvedValue([]);
  const tx = {
    $queryRaw: lock,
    product: { findFirst },
    productBarcode: { findUnique, create },
    auditLog: { create: audit },
  } as unknown as Prisma.TransactionClient;
  return { tx, findFirst, findUnique, create, audit, lock };
}
describe("internal product barcodes", () => {
  it("uses a stable private namespace scoped by organization and product", () => {
    const code = internalBarcodeCode("org", "product");
    expect(code).toMatch(/^SG\d{12}$/);
    expect(internalBarcodeCode("org", "product")).toBe(code);
    expect(internalBarcodeCode("other", "product")).not.toBe(code);
    expect(internalBarcodeCode("org", "other")).not.toBe(code);
  });
  it("does not create a barcode on consultation", async () => {
    const state = setup();
    expect(
      await internalBarcode(state.tx, "actor", "org", "product", false),
    ).toEqual({ code: null, name: "Actron", saleUnit: "BLISTER" });
    expect(state.create).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product", organizationId: "org", active: true },
      }),
    );
  });
  it("adds a secondary code with audit, and reuses it on retry", async () => {
    const state = setup();
    const result = await internalBarcode(
      state.tx,
      "actor",
      "org",
      "product",
      true,
    );
    expect(state.create).toHaveBeenCalledWith({
      data: { productId: "product", code: result.code, primary: false },
    });
    expect(state.audit).toHaveBeenCalledTimes(1);
    state.findUnique.mockResolvedValue({
      productId: "product",
      code: result.code,
    });
    expect(
      await internalBarcode(state.tx, "actor", "org", "product", true),
    ).toEqual(result);
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.audit).toHaveBeenCalledTimes(1);
  });
  it("rejects an inactive or out-of-organization product without writing", async () => {
    const state = setup();
    state.findFirst.mockResolvedValue(null);
    await expect(
      internalBarcode(state.tx, "actor", "org", "product", true),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("never takes a colliding code from another product", async () => {
    const state = setup();
    state.findUnique.mockResolvedValue({ productId: "other" });
    await expect(
      internalBarcode(state.tx, "actor", "org", "product", true),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("checks manage permission before entering the transaction", async () => {
    const transaction = jest.fn();
    const service = new CatalogService({
      $transaction: transaction,
    } as unknown as PrismaService);
    const permission = jest
      .spyOn(service, "assertPermission")
      .mockRejectedValue(new ForbiddenException());
    await expect(
      service.internalBarcode("actor", "org", "product", true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permission).toHaveBeenCalledWith("actor", "org", "CATALOG_MANAGE");
    expect(transaction).not.toHaveBeenCalled();
  });
});
