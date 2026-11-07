import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { BranchDto, BranchStatusDto } from "./branch.dto";
import { OrganizationsService } from "./organizations.service";
import type { PrismaService } from "../prisma/prisma.service";

const branch = {
  id: "branch",
  name: "Centro",
  code: "CENTRO",
  active: true,
  address: "",
  city: "",
  province: "",
  phone: "",
};
function fixture() {
  const member = jest.fn().mockResolvedValue({
    active: true,
    roles: [
      {
        role: {
          permissions: [
            { permission: { code: "ORGANIZATION_MANAGE" } },
            { permission: { code: "ORGANIZATION_READ" } },
          ],
        },
      },
    ],
  });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    branch: {
      findFirst: jest.fn().mockResolvedValue(branch),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue({ ...branch, active: false }),
      create: jest.fn().mockResolvedValue(branch),
    },
    userBranch: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    cashRegister: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    cashSession: { count: jest.fn().mockResolvedValue(0) },
    sale: { count: jest.fn().mockResolvedValue(0) },
    purchase: { count: jest.fn().mockResolvedValue(0) },
    productLot: { count: jest.fn().mockResolvedValue(0) },
    inventoryMovement: { count: jest.fn().mockResolvedValue(0) },
    transfer: { count: jest.fn().mockResolvedValue(0) },
    customerAccountMovement: { count: jest.fn().mockResolvedValue(0) },
    customerReturn: { count: jest.fn().mockResolvedValue(0) },
    supplierReturn: { count: jest.fn().mockResolvedValue(0) },
  };
  const transaction = jest.fn(
    async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  );
  const listBranches = jest.fn();
  const service = new OrganizationsService({
    userOrganization: { findUnique: member },
    branch: { findMany: listBranches },
    $transaction: transaction,
  } as unknown as PrismaService);
  return { service, tx, member, transaction, listBranches };
}

it("reports which branches the actor may operate without hiding destinations", async () => {
  const f = fixture();
  f.listBranches.mockResolvedValue([
    { ...branch, userMemberships: [{ userId: "actor" }] },
    { ...branch, id: "other", userMemberships: [] },
  ]);
  await expect(f.service.listBranches("actor", "org")).resolves.toEqual([
    { ...branch, canAccess: true },
    { ...branch, id: "other", canAccess: false },
  ]);
  expect(f.listBranches).toHaveBeenCalledWith(
    expect.objectContaining({
      select: expect.objectContaining({
        userMemberships: {
          where: { userId: "actor" },
          select: { userId: true },
        },
      }),
    }),
  );
});

it("sin ORGANIZATION_READ solo lista las sucursales propias", async () => {
  const f = fixture();
  f.member.mockResolvedValue({ active: true, roles: [] });
  f.listBranches.mockResolvedValue([
    { ...branch, userMemberships: [{ userId: "actor" }] },
  ]);

  await expect(f.service.listBranches("actor", "org")).resolves.toEqual([
    { ...branch, canAccess: true },
  ]);
  expect(f.listBranches).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        userMemberships: { some: { userId: "actor" } },
      }),
    }),
  );
});

it("con ORGANIZATION_READ no filtra por sucursal propia", async () => {
  const f = fixture();
  f.listBranches.mockResolvedValue([]);

  await f.service.listBranches("actor", "org");

  expect(f.listBranches.mock.calls[0]![0].where).not.toHaveProperty(
    "userMemberships",
  );
});

it.each([
  ["no pertenece a la farmacia", null],
  ["tiene la membresía inactiva", { active: false, roles: [] }],
])("rechaza listar sucursales si %s", async (_name, membership) => {
  const f = fixture();
  f.member.mockResolvedValue(membership);

  await expect(f.service.listBranches("actor", "org")).rejects.toThrow();
  expect(f.listBranches).not.toHaveBeenCalled();
});

it("normalizes and validates branch fields without example defaults", () => {
  const input = plainToInstance(BranchDto, {
    name: " Centro ",
    code: " cen-01 ",
  });
  expect(validateSync(input)).toHaveLength(0);
  expect(input.name).toBe("Centro");
  expect(input.code).toBe("CEN-01");
  for (const bad of [
    { name: "  " },
    { code: "bad code" },
    { phone: "\x1b@" },
    { address: "x".repeat(161) },
    { city: "x".repeat(101) },
  ])
    expect(
      validateSync(
        plainToInstance(BranchDto, { name: "Centro", code: "CENTRO", ...bad }),
      ).length,
    ).toBeGreaterThan(0);
  expect(
    validateSync(plainToInstance(BranchStatusDto, { active: "false" })).length,
  ).toBeGreaterThan(0);
});
it("requires organization management permission before any branch mutation", async () => {
  const f = fixture();
  f.member.mockResolvedValue(null);
  await expect(
    f.service.updateBranch("actor", "org", "branch", branch),
  ).rejects.toThrow();
  await expect(
    f.service.changeBranchStatus("actor", "org", "branch", false),
  ).rejects.toThrow();
  await expect(
    f.service.createBranch("actor", "org", "Centro", "CENTRO"),
  ).rejects.toThrow();
  expect(f.transaction).not.toHaveBeenCalled();
});
it("scopes branch editing to the organization and audits changes transactionally", async () => {
  const f = fixture();
  await f.service.updateBranch("actor", "org", "branch", {
    ...branch,
    address: " Calle 1 ",
  });
  expect(f.tx.branch.findFirst).toHaveBeenCalledWith({
    where: { id: "branch", organizationId: "org", deletedAt: null },
  });
  expect(f.tx.branch.update).toHaveBeenCalledWith({
    where: { id: "branch" },
    data: {
      name: "Centro",
      code: "CENTRO",
      address: "Calle 1",
      city: "",
      province: "",
      phone: "",
    },
  });
  expect(f.tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org",
        actorId: "actor",
        action: "UPDATED",
        before: expect.any(Object),
        after: expect.any(Object),
      }),
    }),
  );
});
it("rejects missing, archived or other-tenant branches", async () => {
  const f = fixture();
  f.tx.branch.findFirst.mockResolvedValue(null);
  await expect(
    f.service.updateBranch("actor", "other", "branch", branch),
  ).rejects.toThrow("No se encontró");
  await expect(
    f.service.changeBranchStatus("actor", "other", "branch", false, true),
  ).rejects.toThrow("No se encontró");
  expect(f.tx.branch.update).not.toHaveBeenCalled();
});
it("serializes status changes and prevents removing the last active branch", async () => {
  const f = fixture();
  f.tx.branch.count.mockResolvedValue(0);
  await expect(
    f.service.changeBranchStatus("actor", "org", "branch", false),
  ).rejects.toThrow("al menos una");
  expect(f.tx.$queryRaw).toHaveBeenCalled();
  expect(f.tx.branch.update).not.toHaveBeenCalled();
});
it("requires closing cash sessions before disabling a branch", async () => {
  const f = fixture();
  f.tx.cashSession.count.mockResolvedValue(1);
  await expect(
    f.service.changeBranchStatus("actor", "org", "branch", false),
  ).rejects.toThrow("cajas abiertas");
  expect(f.tx.branch.update).not.toHaveBeenCalled();
});
it.each([
  "sale",
  "purchase",
  "productLot",
  "inventoryMovement",
  "transfer",
  "customerAccountMovement",
  "cashRegister",
  "customerReturn",
  "supplierReturn",
] as const)(
  "does not remove branches with linked %s records",
  async (model) => {
    const f = fixture();
    f.tx[model].count.mockResolvedValue(1);
    await expect(
      f.service.changeBranchStatus("actor", "org", "branch", false, true),
    ).rejects.toThrow("registros vinculados");
    expect(f.tx.branch.update).not.toHaveBeenCalled();
  },
);
it("archives an unused branch without deleting database records", async () => {
  const f = fixture();
  await f.service.changeBranchStatus("actor", "org", "branch", false, true);
  expect(f.tx.branch.update).toHaveBeenCalledWith({
    where: { id: "branch" },
    data: { active: false, deletedAt: expect.any(Date) },
  });
  expect(f.tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ action: "ARCHIVED" }),
    }),
  );
});
it("reactivates a branch without touching its commercial data", async () => {
  const f = fixture();
  await f.service.changeBranchStatus("actor", "org", "branch", true);
  expect(f.tx.branch.update).toHaveBeenCalledWith({
    where: { id: "branch" },
    data: { active: true },
  });
  expect(f.tx.sale.count).not.toHaveBeenCalled();
});
it("creates a branch with contact data and audit in the same transaction", async () => {
  const f = fixture();
  await f.service.createBranch("actor", "org", "Centro", "centro", {
    ...branch,
    phone: "123",
  });
  expect(f.tx.branch.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org",
        code: "CENTRO",
        phone: "123",
      }),
    }),
  );
  expect(f.tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ action: "CREATED", actorId: "actor" }),
    }),
  );
  expect(f.tx.userBranch.create).toHaveBeenCalledWith({
    data: { userId: "actor", branchId: "branch" },
  });
});
it("reports duplicate branch codes without bypassing organization uniqueness", async () => {
  const f = fixture();
  f.tx.branch.update.mockRejectedValue({ code: "P2002" });
  await expect(
    f.service.updateBranch("actor", "org", "branch", branch),
  ).rejects.toThrow("código de sucursal");
});
