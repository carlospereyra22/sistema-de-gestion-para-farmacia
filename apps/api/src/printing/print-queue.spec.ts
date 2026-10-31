import {
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrintQueueService, digest } from "./print-queue.service";
import type { PrismaService } from "../prisma/prisma.service";

const scope = { actorId: "actor", organizationId: "org", branchId: "branch" };
const input = {
  requestId: "request",
  documentId: "sale",
  documentType: "sale" as const,
};
const existing = {
  id: "job",
  ...input,
  ...scope,
  requestedByUserId: "actor",
  printerId: "printer",
  status: "PENDING",
  lastError: null,
  createdAt: new Date("2026-09-19T00:00:00Z"),
  printedAt: null,
  attempts: 0,
  uncertain: false,
};
function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    printJob: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    printGateway: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const database = {
    ...tx,
    $transaction: jest.fn((callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
    userOrganization: { findUnique: jest.fn() },
    userBranch: { findFirst: jest.fn() },
    printGateway: { findUnique: jest.fn() },
    branch: { findFirst: jest.fn() },
  };
  const service = new PrintQueueService(database as unknown as PrismaService);
  return { service, database, tx };
}
it("deduplicates the same request without rerendering", async () => {
  const { service, tx } = setup();
  jest.spyOn(service, "access").mockResolvedValue();
  const render = jest.fn();
  expect(await service.enqueue(scope, input, render)).toMatchObject({
    id: "job",
  });
  expect(render).not.toHaveBeenCalled();
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
});
it("rejects reuse of an intention for another document or branch", async () => {
  const { service } = setup();
  jest.spyOn(service, "access").mockResolvedValue();
  await expect(
    service.enqueue(scope, { ...input, documentId: "other" }, jest.fn()),
  ).rejects.toBeInstanceOf(ConflictException);
  await expect(
    service.enqueue({ ...scope, branchId: "other" }, input, jest.fn()),
  ).rejects.toBeInstanceOf(ConflictException);
});
it("requires both permission and branch membership", async () => {
  const { service, database } = setup();
  database.userOrganization.findUnique.mockResolvedValue({
    active: true,
    organization: { active: true },
    roles: [{ role: { permissions: [{ permission: { code: "SALE_READ" } }] } }],
  });
  database.userBranch.findFirst.mockResolvedValue(null);
  await expect(service.access(scope, "SALE_READ")).rejects.toBeInstanceOf(
    ForbiddenException,
  );
});
it("gateway credentials are hashed, disabled and mismatched credentials fail", async () => {
  const { service, database } = setup();
  const secret = "a".repeat(64);
  const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  database.printGateway.findUnique.mockResolvedValue({
    id,
    enabled: true,
    branchId: "branch",
    organizationId: "org",
    secretHash: digest(secret),
  });
  database.branch.findFirst.mockResolvedValue({ id: "branch" });
  expect((await service.authenticate(`Bearer ${id}.${secret}`)).id).toBe(id);
  await expect(
    service.authenticate(`Bearer ${id}.${"b".repeat(64)}`),
  ).rejects.toBeInstanceOf(UnauthorizedException);
  database.printGateway.findUnique.mockResolvedValue({ enabled: false });
  await expect(
    service.authenticate(`Bearer ${id}.${secret}`),
  ).rejects.toBeInstanceOf(UnauthorizedException);
});
it("an ACK must own the exact lease", async () => {
  const { service, tx } = setup();
  jest.spyOn(service, "authenticate").mockResolvedValue({
    id: "gateway",
    organizationId: "org",
    branchId: "branch",
  } as Awaited<ReturnType<typeof service.authenticate>>);
  tx.printJob.findFirst.mockResolvedValue({
    ...existing,
    gatewayId: "gateway",
    status: "LEASED",
    leaseId: "current",
  });
  await expect(
    service.finish("token", "job", "old", "printed"),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(tx.printJob.update).not.toHaveBeenCalled();
});
it("uncertain jobs cannot be retried as safe failures", async () => {
  const { service, tx } = setup();
  jest
    .spyOn(service, "status")
    .mockResolvedValue({ ...existing, uncertain: true } as Awaited<
      ReturnType<typeof service.status>
    >);
  await expect(service.retry(scope, "job")).rejects.toBeInstanceOf(
    ConflictException,
  );
  expect(tx.printJob.updateMany).not.toHaveBeenCalled();
});
