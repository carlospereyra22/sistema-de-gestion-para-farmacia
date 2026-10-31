import { randomBytes, randomUUID } from "node:crypto";
import * as forge from "node-forge";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { FiscalCredentialsService } from "../src/fiscal/fiscal-credentials.service";
import { CredentialVault } from "../src/fiscal/credential-vault";

describe("fiscal credentials (local rollback fixtures only)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  const oldKey = process.env.FISCAL_VAULT_KEY;
  beforeAll(async () => {
    process.env.FISCAL_VAULT_KEY = randomBytes(32).toString("hex");
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    if (
      !["localhost", "127.0.0.1", "::1"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw new Error("Local database required");
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await moduleRef?.close();
    if (oldKey === undefined) delete process.env.FISCAL_VAULT_KEY;
    else process.env.FISCAL_VAULT_KEY = oldKey;
  });
  it("encrypts, isolates, validates versions and replaces atomically without enabling invoices", async () => {
    const rollback = new Error("ROLLBACK_CREDENTIALS");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: {
              name: "Certificate fixture",
              fiscalProfile: { legalName: "Test issuer", cuit: "20247237837" },
            },
          });
          const other = await tx.organization.create({
            data: { name: "Other organization" },
          });
          const user = await tx.user.create({
            data: {
              email: `${randomUUID()}@example.invalid`,
              passwordHash: "fixture-only",
            },
          });
          const permission = await tx.permission.findUniqueOrThrow({
            where: { code: "ORGANIZATION_MANAGE" },
          });
          const role = await tx.role.create({
            data: {
              organizationId: org.id,
              name: "Fixture",
              code: "FIXTURE",
              permissions: { create: { permissionId: permission.id } },
            },
          });
          await tx.userOrganization.create({
            data: {
              organizationId: org.id,
              userId: user.id,
              roles: { create: { roleId: role.id } },
            },
          });
          const scoped = new Proxy(tx, {
            get(target, key) {
              return key === "$transaction"
                ? (
                    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
                  ) => fn(tx)
                : Reflect.get(target, key);
            },
          }) as unknown as PrismaService;
          const vault = new CredentialVault();
          const service = new FiscalCredentialsService(
            scoped,
            new OrganizationsService(scoped),
            vault,
          );
          const input = { holderCuit: "20247237837", expectedVersion: 0 };
          await expect(
            service.prepare(user.id, other.id, input),
          ).rejects.toThrow();
          await expect(service.request(user.id, other.id)).rejects.toThrow();
          const prepared = await service.prepare(user.id, org.id, input);
          expect(prepared.version).toBe(1);
          expect(prepared.issuanceEnabled).toBe(false);
          expect(JSON.stringify(prepared)).not.toContain("PRIVATE KEY");
          const request = await service.request(user.id, org.id);
          expect(request.csr).toContain("CERTIFICATE REQUEST");
          expect((await service.prepare(user.id, org.id, input)).version).toBe(
            1,
          );
          expect(
            await tx.fiscalCredential.count({
              where: { organizationId: org.id },
            }),
          ).toBe(1);
          const stored = await tx.fiscalCredential.findFirstOrThrow({
            where: { organizationId: org.id },
          });
          expect(stored.encryptedPrivateKey).not.toContain("PRIVATE KEY");
          const pem = await vault.open(
            stored.encryptedPrivateKey,
            `fiscal-credential:v1:HOMOLOGATION:${org.id}`,
          );
          const key = forge.pki.privateKeyFromPem(pem);
          const certificate = forge.pki.createCertificate();
          certificate.publicKey = forge.pki.rsa.setPublicKey(key.n, key.e);
          certificate.serialNumber = "01";
          certificate.validity.notBefore = new Date(Date.now() - 60000);
          certificate.validity.notAfter = new Date(Date.now() + 86400000);
          certificate.setSubject([
            { name: "serialNumber", value: `CUIT ${input.holderCuit}` },
          ]);
          certificate.setIssuer(certificate.subject.attributes);
          certificate.sign(key, forge.md.sha256.create());
          const certificatePem = forge.pki.certificateToPem(certificate);
          await expect(
            service.upload(user.id, org.id, {
              ...input,
              certificate: certificatePem,
            }),
          ).rejects.toThrow("cambió");
          await expect(
            service.upload(user.id, org.id, {
              ...input,
              expectedVersion: 1,
              certificate: "invalid",
            }),
          ).rejects.toThrow();
          expect((await service.status(user.id, org.id)).version).toBe(1);
          const saved = await service.upload(user.id, org.id, {
            ...input,
            expectedVersion: 1,
            certificate: certificatePem,
          });
          expect(saved.status).toBe("FILES_VALIDATED_PENDING_ARCA");
          expect(saved.version).toBe(2);
          expect(saved.issuanceEnabled).toBe(false);
          await expect(
            service.upload(user.id, org.id, {
              ...input,
              expectedVersion: 2,
              certificate: certificatePem,
            }),
          ).rejects.toThrow("reemplazo");
          await tx.organization.update({
            where: { id: org.id },
            data: {
              fiscalProfile: { legalName: "Test issuer", cuit: "20123456786" },
            },
          });
          expect((await service.status(user.id, org.id)).profileMatches).toBe(
            false,
          );
          await expect(
            service.upload(user.id, org.id, {
              ...input,
              expectedVersion: 2,
              replace: true,
              certificate: certificatePem,
            }),
          ).rejects.toThrow("CUIT");
          await tx.organization.update({
            where: { id: org.id },
            data: {
              fiscalProfile: { legalName: "Test issuer", cuit: "20247237837" },
            },
          });
          const reset = await service.prepare(user.id, org.id, {
            ...input,
            expectedVersion: 2,
            replace: true,
          });
          expect(reset.version).toBe(3);
          expect(reset.hasCertificate).toBe(false);
          const audits = await tx.auditLog.findMany({
            where: { organizationId: org.id, entityType: "FISCAL_CREDENTIAL" },
          });
          expect(audits).toHaveLength(3);
          expect(JSON.stringify(audits)).not.toContain("PRIVATE KEY");
          expect(JSON.stringify(audits)).not.toContain("BEGIN CERTIFICATE");
          const production = await service.prepare(
            user.id,
            org.id,
            input,
            "PRODUCTION",
          );
          expect(production.environment).toBe("PRODUCTION");
          expect(production.version).toBe(1);
          expect(production.issuanceEnabled).toBe(false);
          expect((await service.status(user.id, org.id)).version).toBe(3);
          const productionRequest = await service.request(
            user.id,
            org.id,
            "PRODUCTION",
          );
          expect(productionRequest.filename).toContain("produccion");
          expect(productionRequest.csr).not.toBe(request.csr);
          const productionStored = await tx.fiscalCredential.findUniqueOrThrow({
            where: {
              organizationId_environment: {
                organizationId: org.id,
                environment: "PRODUCTION",
              },
            },
          });
          await expect(
            vault.open(
              productionStored.encryptedPrivateKey,
              `fiscal-credential:v1:HOMOLOGATION:${org.id}`,
            ),
          ).rejects.toThrow();
          await expect(
            service.status(user.id, other.id, "PRODUCTION"),
          ).rejects.toThrow();
          const blocked = jest
            .spyOn(vault, "provider")
            .mockReturnValue("WINDOWS_DPAPI");
          expect(
            (await service.status(user.id, org.id, "PRODUCTION")).storage,
          ).toBe("UNAVAILABLE");
          await expect(
            service.prepare(user.id, org.id, input, "PRODUCTION"),
          ).rejects.toThrow("custodia");
          blocked.mockRestore();
          throw rollback;
        },
        { timeout: 20000 },
      ),
    ).rejects.toBe(rollback);
  }, 25000);
});
