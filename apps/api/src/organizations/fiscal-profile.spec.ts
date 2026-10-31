import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import {
  FiscalProfileDto,
  readFiscalProfile,
  validateFiscalDraft,
} from "./fiscal-profile";
import { OrganizationsService } from "./organizations.service";
import { SalesService } from "../sales/sales.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

it("allows incomplete drafts and validates provided fiscal identifiers and dates", () => {
  const blank = readFiscalProfile(null);
  expect(validateSync(plainToInstance(FiscalProfileDto, blank))).toHaveLength(
    0,
  );
  expect(() => validateFiscalDraft(blank)).not.toThrow();
  expect(() =>
    validateFiscalDraft({
      ...blank,
      cuit: "20247237837",
      activityStart: "2024-02-29",
    }),
  ).not.toThrow();
  for (const cuit of ["20247237838", "123", "abcdefghijk"])
    expect(() => validateFiscalDraft({ ...blank, cuit })).toThrow();
  for (const activityStart of ["2025-02-29", "2024-13-01", "invalid"])
    expect(() => validateFiscalDraft({ ...blank, activityStart })).toThrow();
  expect(
    validateSync(
      plainToInstance(FiscalProfileDto, { ...blank, vatCondition: "UNKNOWN" }),
    ).length,
  ).toBeGreaterThan(0);
});

function fixture(allowed = true) {
  const tx = {
    organization: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue({
        active: allowed,
        roles: [
          {
            role: {
              permissions: ["ORGANIZATION_MANAGE", "SALE_MANAGE"].map(
                (code) => ({ permission: { code } }),
              ),
            },
          },
        ],
      }),
    },
    $transaction: jest.fn(async (fn: (value: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  return {
    tx,
    prisma,
    service: new OrganizationsService(prisma as unknown as PrismaService),
  };
}

it("saves only the scoped fiscal draft and audit, without enabling issuance or replacing ticket settings", async () => {
  const { tx, prisma, service } = fixture();
  const profile = readFiscalProfile({ legalName: "  Comercio  " });
  expect(await service.updateFiscalProfile("actor", "org", profile)).toEqual({
    profile,
    issuanceEnabled: false,
    status: "NOT_CONNECTED",
  });
  expect(tx.organization.update).toHaveBeenCalledWith({
    where: { id: "org" },
    data: { fiscalProfile: profile },
  });
  expect(prisma.userOrganization.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        userId_organizationId: { userId: "actor", organizationId: "org" },
      },
    }),
  );
  expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
});

it("rejects unauthorized updates before opening a transaction", async () => {
  const { prisma, service } = fixture(false);
  await expect(
    service.updateFiscalProfile("actor", "org", readFiscalProfile(null)),
  ).rejects.toThrow();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("blocks invoice checkout before any stock, payment or sale transaction", async () => {
  const { prisma } = fixture();
  const service = new SalesService(
    prisma as unknown as PrismaService,
    {} as AuditService,
  );
  await expect(
    service.complete("actor", "org", "branch", {
      documentType: "INVOICE",
      items: [],
      payments: [],
    }),
  ).rejects.toThrow("Confirmá explícitamente el ambiente fiscal");
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
