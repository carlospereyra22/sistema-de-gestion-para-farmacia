import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CatalogService } from "./catalog.service";
import type { PrismaService } from "../prisma/prisma.service";

function setup() {
  const model = () => ({
    findMany: jest
      .fn()
      .mockResolvedValue([
        { id: "item", name: "Original", active: true, parentId: null },
      ]),
    findFirst: jest
      .fn()
      .mockResolvedValue({ id: "item", name: "Original", active: true }),
    update: jest.fn().mockResolvedValue({
      id: "item",
      name: "Nuevo",
      parentId: null,
      active: true,
    }),
  });
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    category: model(),
    laboratory: model(),
    product: { count: jest.fn().mockResolvedValue(0) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn(
      async (operation: (value: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
    category: { findMany: jest.fn(), upsert: jest.fn() },
  };
  const service = new CatalogService(prisma as unknown as PrismaService);
  const permission = jest
    .spyOn(service, "assertPermission")
    .mockResolvedValue(undefined);
  return { service, tx, prisma, permission };
}
describe("category and laboratory management", () => {
  it("moves a category under an existing parent and audits the change", async () => {
    const { service, tx } = setup();
    tx.category.findMany.mockResolvedValue([
      { id: "item", name: "Original", active: true, parentId: null },
      { id: "parent", name: "Principal", active: true, parentId: null },
    ]);
    await service.changeNamedItem(
      "actor",
      "org",
      "categories",
      "item",
      "Original",
      "parent",
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.category.update).toHaveBeenCalledWith({
      where: { id: "item" },
      data: { name: "Original", parentId: "parent" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "MOVED" }),
      }),
    );
    expect(tx.product.count).not.toHaveBeenCalled();
  });
  it("blocks archiving a parent with active subcategories", async () => {
    const { service, tx } = setup();
    tx.category.findMany.mockResolvedValue([
      { id: "item", name: "Original", active: true, parentId: null },
      { id: "child", name: "Hija", active: true, parentId: "item" },
    ]);
    await expect(
      service.changeNamedItem("actor", "org", "categories", "item"),
    ).rejects.toThrow("subcategorías");
    expect(tx.category.update).not.toHaveBeenCalled();
  });
  it.each(["categories", "laboratories"] as const)(
    "renames %s with tenant scope and audit",
    async (type) => {
      const { service, tx, permission } = setup();
      await service.changeNamedItem("actor", "org", type, "item", " Nuevo ");
      expect(permission).toHaveBeenCalledWith("actor", "org", "CATALOG_MANAGE");
      const model = type === "categories" ? tx.category : tx.laboratory;
      if (type === "categories")
        expect(model.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { organizationId: "org" } }),
        );
      else
        expect(model.findFirst).toHaveBeenCalledWith({
          where: { id: "item", organizationId: "org", active: true },
        });
      expect(model.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data:
            type === "categories"
              ? { name: "Nuevo", parentId: null }
              : { name: "Nuevo" },
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "RENAMED",
            actorId: "actor",
            organizationId: "org",
          }),
        }),
      );
    },
  );
  it.each(["categories", "laboratories"] as const)(
    "archives unused %s instead of physically deleting",
    async (type) => {
      const { service, tx } = setup();
      await service.changeNamedItem("actor", "org", type, "item");
      const model = type === "categories" ? tx.category : tx.laboratory;
      expect(model.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
      expect(tx.product.count).toHaveBeenCalledWith({
        where: {
          organizationId: "org",
          ...(type === "categories"
            ? { categoryId: "item" }
            : { laboratoryId: "item" }),
        },
      });
    },
  );
  it("blocks deletion when products are associated", async () => {
    const { service, tx } = setup();
    tx.product.count.mockResolvedValue(3);
    await expect(
      service.changeNamedItem("actor", "org", "categories", "item"),
    ).rejects.toThrow("productos asociados");
    expect(tx.category.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it("rejects cross-tenant or absent records", async () => {
    const { service, tx } = setup();
    tx.category.findFirst.mockResolvedValue(null);
    await expect(
      service.changeNamedItem("actor", "org", "categories", "other", "Nuevo"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.category.update).not.toHaveBeenCalled();
  });
  it("requires manage permission before accessing records", async () => {
    const { service, prisma, permission } = setup();
    permission.mockRejectedValue(new ForbiddenException());
    await expect(
      service.changeNamedItem("actor", "org", "categories", "item", "Nuevo"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(["", "  ", "x"])("rejects invalid names %s", async (name) => {
    const { service, prisma } = setup();
    await expect(
      service.changeNamedItem("actor", "org", "categories", "item", name),
    ).rejects.toThrow("entre 2 y 120");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("reports duplicate names as a conflict", async () => {
    const { service, tx } = setup();
    tx.category.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    await expect(
      service.changeNamedItem("actor", "org", "categories", "item", "Nuevo"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("does not recreate renamed or archived default categories", async () => {
    const { service, prisma } = setup();
    prisma.category.findMany.mockResolvedValue([
      { id: "a", name: "Renombrada", active: true },
      { id: "b", name: "Medicamentos", active: false },
    ]);
    expect(await service.ensureDefaultCategories("actor", "org")).toEqual({
      categories: [{ id: "a", name: "Renombrada" }],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.category.upsert).not.toHaveBeenCalled();
  });
});
