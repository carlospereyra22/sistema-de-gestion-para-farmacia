import { CatalogService } from "./catalog.service";
import { PrismaService } from "../prisma/prisma.service";

function fixture(name = "Mayoristas") {
  const tx = {
    priceList: {
      findFirst: jest.fn().mockResolvedValue({ id: "list", name }),
      update: jest.fn().mockResolvedValue({ id: "list", name: "Revendedores" }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn(async (run: (value: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const service = new CatalogService(prisma as unknown as PrismaService);
  const permission = jest
    .spyOn(service, "assertPermission")
    .mockResolvedValue(undefined);
  return { tx, service, permission };
}

it("renames the scoped list with permission and audit without changing prices", async () => {
  const { service, tx, permission } = fixture();
  await service.renamePriceList("actor", "org", "list", " Revendedores ");
  expect(permission).toHaveBeenCalledWith("actor", "org", "CATALOG_MANAGE");
  expect(tx.priceList.findFirst).toHaveBeenCalledWith({
    where: { id: "list", organizationId: "org", active: true },
  });
  expect(tx.priceList.update).toHaveBeenCalledWith({
    where: { id: "list" },
    data: { name: "Revendedores" },
  });
  expect(tx.auditLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      before: { name: "Mayoristas" },
      after: { name: "Revendedores" },
      action: "PRICE_LIST_RENAMED",
    }),
  });
});

it("protects the general list", async () => {
  const { service, tx } = fixture("Precio general");
  await expect(
    service.renamePriceList("actor", "org", "list", "Otra lista"),
  ).rejects.toThrow("protegido");
  expect(tx.priceList.update).not.toHaveBeenCalled();
});

it.each([" ", "a", " Precio GENERAL ", "a".repeat(121)])(
  "rejects invalid or reserved names %s",
  async (name) => {
    const { service, tx } = fixture();
    await expect(
      service.renamePriceList("actor", "org", "list", name),
    ).rejects.toThrow();
    expect(tx.priceList.update).not.toHaveBeenCalled();
  },
);

it("does not write when a list is missing from the organization or permission is denied", async () => {
  const { service, tx, permission } = fixture();
  tx.priceList.findFirst.mockResolvedValue(null);
  await expect(
    service.renamePriceList("actor", "org", "list", "Nueva lista"),
  ).rejects.toThrow("no encontrada");
  permission.mockRejectedValue(new Error("denied"));
  await expect(
    service.renamePriceList("actor", "org", "list", "Nueva lista"),
  ).rejects.toThrow("denied");
  expect(tx.priceList.update).not.toHaveBeenCalled();
});
