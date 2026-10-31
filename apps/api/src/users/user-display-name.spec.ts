import { UsersService } from "./users.service";
import type { PrismaService } from "../prisma/prisma.service";
import { UserDisplayNameDto } from "./users.controller";
import { validateSync } from "class-validator";
it("allows changing own display name without modifying own access or another organization", async () => {
  const update = jest.fn().mockResolvedValue({});
  const audit = jest.fn().mockResolvedValue({});
  const target = jest.fn().mockResolvedValue({ id: "membership" });
  const member = jest.fn().mockResolvedValue({
    active: true,
    roles: [
      { role: { permissions: [{ permission: { code: "USER_MANAGE" } }] } },
    ],
  });
  const tx = {
    userOrganization: { findUnique: target, update },
    auditLog: { create: audit },
  };
  const transaction = jest.fn(
    async (fn: (client: object) => Promise<unknown>) => fn(tx),
  );
  const service = new UsersService({
    userOrganization: { findUnique: member },
    $transaction: transaction,
  } as unknown as PrismaService);
  await service.setDisplayName("self", "org", "self", " Carlos ");
  expect(target).toHaveBeenCalledWith({
    where: { userId_organizationId: { userId: "self", organizationId: "org" } },
  });
  expect(update).toHaveBeenCalledWith({
    where: { id: "membership" },
    data: { displayName: "Carlos" },
  });
  expect(audit).toHaveBeenCalledTimes(1);
  target.mockResolvedValue(null);
  await expect(
    service.setDisplayName("self", "org", "outsider", "Name"),
  ).rejects.toThrow();
  expect(update).toHaveBeenCalledTimes(1);
  member.mockResolvedValue(null);
  await expect(
    service.setDisplayName("self", "other-org", "self", "Name"),
  ).rejects.toThrow();
});
it("allows clearing a name, rejects excessive lengths and printer control codes", () => {
  for (const displayName of ["", "Carlos"])
    expect(
      validateSync(Object.assign(new UserDisplayNameDto(), { displayName })),
    ).toHaveLength(0);
  for (const displayName of ["x".repeat(121), "\x1b@"])
    expect(
      validateSync(Object.assign(new UserDisplayNameDto(), { displayName }))
        .length,
    ).toBeGreaterThan(0);
});
