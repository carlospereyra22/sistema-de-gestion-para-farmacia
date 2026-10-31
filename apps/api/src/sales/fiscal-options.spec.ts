import { SalesService } from "./sales.service";

function setup() {
  const profile = {
    legalName: "Comercio",
    cuit: "20247237837",
    vatCondition: "MONOTAX",
    address: "Calle 123",
    city: "Posadas",
    province: "Misiones",
    activityStart: "2020-01-01",
  };
  const credential = {
    certificate: "fixture",
    expiresAt: new Date("2099-01-01"),
    representedCuit: profile.cuit,
  };
  const prisma = {
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue({
        active: true,
        roles: [
          {
            role: { permissions: [{ permission: { code: "SALE_MANAGE" } }] },
          },
        ],
      }),
    },
    branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch" }) },
    organization: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ fiscalProfile: profile }),
    },
    fiscalProductionConfiguration: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    fiscalPoint: { findMany: jest.fn().mockResolvedValue([{ point: 1 }]) },
    fiscalCredential: { findUnique: jest.fn().mockResolvedValue(credential) },
  };
  return {
    prisma,
    profile,
    credential,
    service: new SalesService(prisma as never, {} as never),
  };
}
describe("invoice selector readiness", () => {
  it("enables configured homologation", async () => {
    const { service } = setup();
    expect(await service.fiscalOptions("actor", "org", "branch")).toMatchObject(
      {
        environment: "HOMOLOGATION",
        voucherTypes: [{ code: 11 }],
        reason: null,
      },
    );
  });
  it.each(["certificate", "expiry", "cuit", "point", "profile"])(
    "disables incomplete %s configuration",
    async (missing) => {
      const { service, prisma, credential, profile } = setup();
      if (missing === "certificate")
        prisma.fiscalCredential.findUnique.mockResolvedValue(null);
      if (missing === "expiry")
        prisma.fiscalCredential.findUnique.mockResolvedValue({
          ...credential,
          expiresAt: new Date("2000-01-01"),
        });
      if (missing === "cuit")
        prisma.fiscalCredential.findUnique.mockResolvedValue({
          ...credential,
          representedCuit: "other",
        });
      if (missing === "point")
        prisma.fiscalPoint.findMany.mockResolvedValue([]);
      if (missing === "profile")
        prisma.organization.findUniqueOrThrow.mockResolvedValue({
          fiscalProfile: { ...profile, address: "" },
        });
      expect(
        await service.fiscalOptions("actor", "org", "branch"),
      ).toMatchObject({ voucherTypes: [], reason: expect.any(String) });
    },
  );
  it("does not fall back to homologation when production fails validation", async () => {
    const { service, prisma } = setup();
    prisma.fiscalProductionConfiguration.findFirst.mockResolvedValue({
      enabled: true,
    });
    expect(await service.fiscalOptions("actor", "org", "branch")).toMatchObject(
      { environment: "PRODUCTION", voucherTypes: [] },
    );
    expect(prisma.fiscalCredential.findUnique).not.toHaveBeenCalled();
  });
});
