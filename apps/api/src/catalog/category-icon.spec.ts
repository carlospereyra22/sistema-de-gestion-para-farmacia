import { CatalogService } from "./catalog.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ForbiddenException } from "@nestjs/common";
function setup() {
  const category = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue({ icon: "auto" }),
    update: jest.fn().mockResolvedValue({ id: "cat", icon: "box" }),
    create: jest.fn().mockResolvedValue({ id: "cat", icon: "box" }),
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    category,
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    category,
    $transaction: jest.fn(async (fn: (value: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const service = new CatalogService(prisma as unknown as PrismaService);
  const permission = jest
    .spyOn(service, "assertPermission")
    .mockResolvedValue(undefined);
  return { service, category, tx, permission };
}
it("creates the category with the chosen icon", async () => {
  const { service, category } = setup();
  await service.createCategory("actor", "org", "Nueva", "box");
  expect(category.create).toHaveBeenCalledWith({
    data: { organizationId: "org", name: "Nueva", icon: "box", parentId: null },
  });
});
it("saves color and icon together and rejects unknown colors", async () => {
  const { service, category, tx } = setup();
  category.findFirst.mockResolvedValue({ icon: "auto", color: "auto" });
  await service.categoryIcon("actor", "org", "cat", "box", "rose");
  expect(category.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { icon: "box", color: "rose" } }),
  );
  expect(tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        before: { icon: "auto", color: "auto" },
        after: { icon: "box", color: "rose" },
      }),
    }),
  );
  await expect(
    // @ts-expect-error Runtime input must be checked independently of TypeScript.
    service.categoryIcon("actor", "org", "cat", "box", "unknown"),
  ).rejects.toThrow("Color inválido");
});
it("changes and audits only the authorized category icon", async () => {
  const { service, category, tx, permission } = setup();
  await service.categoryIcon("actor", "org", "cat", "box");
  expect(permission).toHaveBeenCalledWith("actor", "org", "CATALOG_MANAGE");
  expect(category.findFirst).toHaveBeenCalledWith({
    where: { id: "cat", organizationId: "org", active: true },
    select: { icon: true, color: true },
  });
  expect(category.update).toHaveBeenCalledWith({
    where: { id: "cat" },
    data: { icon: "box" },
    select: { id: true, icon: true },
  });
  expect(tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        before: { icon: "auto" },
        after: { icon: "box" },
      }),
    }),
  );
});
it("rejects missing records and unauthorized changes", async () => {
  const { service, category, permission } = setup();
  category.findFirst.mockResolvedValue(null);
  await expect(
    service.categoryIcon("actor", "other", "cat", "box"),
  ).rejects.toThrow();
  permission.mockRejectedValue(new ForbiddenException());
  await expect(
    service.categoryIcon("actor", "org", "cat", "box"),
  ).rejects.toThrow(ForbiddenException);
  expect(category.update).not.toHaveBeenCalled();
});
