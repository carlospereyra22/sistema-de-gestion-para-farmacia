import { verify } from "@node-rs/argon2";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  bootstrapProduction,
  parseBootstrapSettings,
  productionPermissions,
} from "../prisma/bootstrap-production";

const input = {
  organizationName: "Farmacia de prueba",
  branchName: "Sucursal de prueba",
  email: " OWNER@example.com ",
  password: "test-only-long-password",
};

function fixture() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    organization: {
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockResolvedValue({ id: "org", name: input.organizationName }),
    },
    branch: {
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockResolvedValue({ id: "branch", name: input.branchName }),
    },
    user: {
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockResolvedValue({ id: "owner", email: "owner@example.com" }),
    },
    role: {
      create: jest
        .fn()
        .mockImplementation(async ({ data }: { data: { code: string } }) => ({
          id: data.code,
          code: data.code,
        })),
    },
    permission: {
      upsert: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { code: string } }) => ({
          id: where.code,
        })),
    },
    rolePermission: { create: jest.fn().mockResolvedValue({}) },
    userOrganization: {
      create: jest.fn().mockResolvedValue({ id: "membership" }),
    },
    userBranch: { create: jest.fn().mockResolvedValue({}) },
    userOrganizationRole: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const transaction = jest
    .fn()
    .mockImplementation(
      async (
        callback: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );
  const prisma = { $transaction: transaction } as unknown as PrismaClient;
  return { tx, transaction, prisma };
}

describe("Production bootstrap", () => {
  it("normalizes names and email without changing password", () => {
    expect(
      parseBootstrapSettings({ ...input, branchName: " Branch " }),
    ).toEqual({
      ...input,
      branchName: "Branch",
      email: "owner@example.com",
    });
  });

  it("rejects invalid input before opening a transaction without disclosing it", async () => {
    const { prisma, transaction } = fixture();
    await expect(
      bootstrapProduction(prisma, { ...input, password: "secret" }),
    ).rejects.toThrow("16 a 256");
    expect(transaction).not.toHaveBeenCalled();
    expect(() =>
      parseBootstrapSettings({ ...input, email: "invalid" }),
    ).toThrow("Datos invalidos");
  });

  it.each(["organization", "user", "branch"] as const)(
    "refuses existing %s records before any write",
    async (model) => {
      const { tx, prisma } = fixture();
      tx[model].count.mockResolvedValue(1);
      await expect(bootstrapProduction(prisma, input)).rejects.toThrow(
        "No se modifico nada",
      );
      expect(tx.organization.create).not.toHaveBeenCalled();
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.permission.upsert).not.toHaveBeenCalled();
    },
  );

  it("creates only the initial identity graph and audits without secrets", async () => {
    const { tx, prisma, transaction } = fixture();
    await expect(bootstrapProduction(prisma, input)).resolves.toEqual({
      organizationName: input.organizationName,
      branchName: input.branchName,
      email: "owner@example.com",
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    const call = tx.user.create.mock.calls[0]?.[0] as {
      data: { email: string; passwordHash: string };
    };
    expect(call.data.email).toBe("owner@example.com");
    expect(await verify(call.data.passwordHash, input.password)).toBe(true);
    expect(tx.rolePermission.create).toHaveBeenCalledTimes(
      productionPermissions.length * 2,
    );
    expect(tx.userBranch.create).toHaveBeenCalledWith({
      data: { userId: "owner", branchId: "branch" },
    });
    expect(tx.userOrganizationRole.create).toHaveBeenCalledWith({
      data: { membershipId: "membership", roleId: "OWNER" },
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      input.password,
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      call.data.passwordHash,
    );
  });

  it("propagates a failure inside the transaction instead of reporting success", async () => {
    const { tx, prisma } = fixture();
    tx.user.create.mockRejectedValue(new Error("simulated failure"));
    await expect(bootstrapProduction(prisma, input)).rejects.toThrow(
      "simulated failure",
    );
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
