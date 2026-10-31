import { CatalogService } from "./catalog.service";
import type { PrismaService } from "../prisma/prisma.service";

function fixture() {
  const nodes = [
    {
      id: "root",
      name: "Cabello",
      parentId: null as string | null,
      active: true,
    },
  ];
  const category = {
    findMany: jest.fn(async () => [...nodes]),
    create: jest.fn(
      async ({ data }: { data: { name: string; parentId: string } }) => {
        const node = { ...data, id: `child-${nodes.length}`, active: true };
        nodes.push(node);
        return node;
      },
    ),
  };
  const tx = {
    category,
    $executeRaw: jest.fn(),
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    ),
  };
  const service = new CatalogService(prisma as unknown as PrismaService);
  jest.spyOn(service, "assertPermission").mockResolvedValue(undefined);
  return { service, nodes, tx };
}

it("creates only missing children and reuses the same chain on a second selection", async () => {
  const { service, tx } = fixture();
  const first = await service.resolveExternalCategory(
    "actor",
    "org",
    ["Capilar", "Shampoo", "Matizadores"],
    "Cabello",
  );
  expect(first).toEqual({ categoryId: "child-2", created: 2 });
  expect(
    await service.resolveExternalCategory(
      "actor",
      "org",
      ["Capilar", "Shampoo", "Matizadores"],
      "Cabello",
    ),
  ).toEqual({ categoryId: "child-2", created: 0 });
  expect(tx.category.create).toHaveBeenCalledTimes(2);
  expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
});

it("leaves unknown roots for manual selection without creating anything", async () => {
  const { service, tx } = fixture();
  expect(
    await service.resolveExternalCategory(
      "actor",
      "org",
      ["Perfumes", "Mujer"],
      "Perfumería",
    ),
  ).toEqual({ categoryId: null, created: 0 });
  expect(tx.category.create).not.toHaveBeenCalled();
});
