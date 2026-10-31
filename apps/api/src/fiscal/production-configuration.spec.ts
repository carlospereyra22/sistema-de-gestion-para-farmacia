import type { PrismaService } from "../prisma/prisma.service";
import type { OrganizationsService } from "../organizations/organizations.service";
import type { ArcaConnectionService } from "./arca-connection.service";
import type { CredentialVault } from "./credential-vault";
import { ProductionConfigurationService } from "./production-configuration.service";

describe("production activation prerequisites", () => {
  const originalIssuance = process.env.FISCAL_PRODUCTION_ISSUANCE;
  const originalRecovery = process.env.FISCAL_RECOVERY_VERIFIED;
  afterEach(() => {
    if (originalIssuance === undefined)
      delete process.env.FISCAL_PRODUCTION_ISSUANCE;
    else process.env.FISCAL_PRODUCTION_ISSUANCE = originalIssuance;
    if (originalRecovery === undefined)
      delete process.env.FISCAL_RECOVERY_VERIFIED;
    else process.env.FISCAL_RECOVERY_VERIFIED = originalRecovery;
  });
  function fixture() {
    const prisma = { $transaction: jest.fn() };
    const organizations = {
      authorizeFiscalManagement: jest.fn().mockResolvedValue(undefined),
    };
    const connection = {
      access: jest.fn().mockResolvedValue({
        environment: "PRODUCTION",
        cuit: "20247237837",
        version: 1,
      }),
      points: jest.fn().mockResolvedValue([]),
    };
    const service = new ProductionConfigurationService(
      prisma as unknown as PrismaService,
      organizations as unknown as OrganizationsService,
      connection as unknown as ArcaConnectionService,
      { provider: () => "AES256_GCM" } as CredentialVault,
    );
    return { prisma, organizations, connection, service };
  }
  it("checks management permission before external queries or mutations", async () => {
    const { service, organizations, connection, prisma } = fixture();
    organizations.authorizeFiscalManagement.mockRejectedValue(
      new Error("denied"),
    );
    await expect(
      service.activate("actor", "org", "branch", 3, true),
    ).rejects.toThrow("denied");
    expect(connection.access).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("does not activate while the server issuance flag is disabled", async () => {
    delete process.env.FISCAL_PRODUCTION_ISSUANCE;
    const { service, connection, prisma } = fixture();
    await expect(
      service.activate("actor", "org", "branch", 3, true),
    ).rejects.toThrow("no está activada");
    expect(connection.access).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("requires verified recovery and explicit point exclusivity", async () => {
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
    delete process.env.FISCAL_RECOVERY_VERIFIED;
    const { service, connection, prisma } = fixture();
    await expect(
      service.activate("actor", "org", "branch", 3, true),
    ).rejects.toThrow("respaldo externo");
    process.env.FISCAL_RECOVERY_VERIFIED = "yes";
    await expect(
      service.activate("actor", "org", "branch", 3, false),
    ).rejects.toThrow("exclusivo");
    expect(connection.access).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("never invents a point when ARCA returns no eligible points", async () => {
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
    process.env.FISCAL_RECOVERY_VERIFIED = "yes";
    const { service, connection, prisma } = fixture();
    await expect(
      service.activate("actor", "org", "branch", 3, true),
    ).rejects.toThrow("no habilitó");
    expect(connection.access).toHaveBeenCalledWith(
      "actor",
      "org",
      "setup",
      "PRODUCTION",
      true,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
