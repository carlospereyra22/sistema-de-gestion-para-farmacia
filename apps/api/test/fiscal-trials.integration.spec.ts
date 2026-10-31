import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { ArcaConnectionService } from "../src/fiscal/arca-connection.service";
import { ArcaSoap } from "../src/fiscal/arca-soap";
import { FiscalTrialService } from "../src/fiscal/fiscal-trial.service";

describe("homologation trials (rollback DB, mocked ARCA only)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    if (
      !["127.0.0.1", "localhost", "::1"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw new Error("Local database only");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
  });
  it("isolates, authorizes, deduplicates, preserves snapshots and reconciles without reissuing", async () => {
    const rollback = new Error("ROLLBACK_TRIAL");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const profile = {
            legalName: "Fixture",
            cuit: "20247237837",
            vatCondition: "MONOTAX",
            address: "Test",
            city: "Test",
            province: "Test",
            activityStart: "2026-01-01",
          };
          const org = await tx.organization.create({
            data: { name: "Trial fixture", fiscalProfile: profile },
          });
          const other = await tx.organization.create({
            data: { name: "Other trial fixture" },
          });
          const user = await tx.user.create({
            data: {
              email: `${randomUUID()}@example.invalid`,
              passwordHash: "test",
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
          const connection = app.get(ArcaConnectionService);
          const access = jest.spyOn(connection, "access").mockResolvedValue({
            token: "fixture-token",
            sign: "fixture-sign",
            cuit: profile.cuit,
            version: 1,
          });
          const points = jest
            .spyOn(connection, "points")
            .mockResolvedValue([
              { number: 1, blocked: "N", type: "CAE", closed: "" },
            ]);
          const soap = new ArcaSoap();
          let sends = 0;
          const external = jest
            .spyOn(soap, "call")
            .mockImplementation(async (_kind, op) => {
              if (op === "FECompUltimoAutorizado")
                return { CbteNro: "0", PtoVta: "1", CbteTipo: "11" };
              if (op === "FECAESolicitar") {
                sends++;
                return {
                  FeCabResp: { PtoVta: "1", CbteTipo: "11", Resultado: "A" },
                  FeDetResp: {
                    FECAEDetResponse: {
                      Resultado: "A",
                      CbteDesde: "1",
                      CbteHasta: "1",
                      CAE: "12345678901234",
                      CAEFchVto: "20261007",
                    },
                  },
                };
              }
              throw new Error("Unexpected operation");
            });
          const service = new FiscalTrialService(
            scoped,
            new OrganizationsService(scoped),
            connection,
            soap,
          );
          try {
            await expect(service.history(user.id, other.id)).rejects.toThrow();
            await expect(
              service.issue(user.id, other.id, randomUUID(), 1),
            ).rejects.toThrow();
            expect(access).not.toHaveBeenCalled();
            const request = randomUUID();
            const first = await service.issue(user.id, org.id, request, 1);
            expect(first.status).toBe("AUTHORIZED");
            expect(first.totalMinor).toBe(10000);
            expect(sends).toBe(1);
            expect((await service.issue(user.id, org.id, request, 1)).id).toBe(
              first.id,
            );
            expect(sends).toBe(1);
            await expect(
              service.issue(user.id, org.id, request, 2),
            ).rejects.toThrow();
            await expect(
              service.issue(user.id, org.id, randomUUID(), 2),
            ).rejects.toThrow();
            await tx.organization.update({
              where: { id: org.id },
              data: { fiscalProfile: { ...profile, legalName: "Changed" } },
            });
            expect(
              (await service.history(user.id, org.id))[0]?.issuer,
            ).toMatchObject(profile);
            // Lost response: record keeps its reserved number; new emissions are blocked.
            external.mockImplementation(async (_kind, op) => {
              if (op === "FECompUltimoAutorizado") return { CbteNro: "1" };
              if (op === "FECAESolicitar") {
                sends++;
                throw new Error("Timeout");
              }
              throw new Error("Unexpected operation");
            });
            const uncertain = await service.issue(
              user.id,
              org.id,
              randomUUID(),
              1,
            );
            expect(uncertain.status).toBe("UNCERTAIN");
            expect(uncertain.number).toBe(2);
            await expect(
              service.issue(user.id, org.id, randomUUID(), 1),
            ).rejects.toThrow("pendiente");
            expect(sends).toBe(2);
            external.mockImplementation(async (_kind, op) => {
              if (op !== "FECompConsultar")
                throw new Error("Must only consult");
              return {
                ResultGet: {
                  Resultado: "A",
                  CbteDesde: "2",
                  CbteHasta: "2",
                  PtoVta: "1",
                  CbteTipo: "11",
                  CbteFch: uncertain.date,
                  ImpTotal: "100.00",
                  DocTipo: "99",
                  DocNro: "0",
                  Concepto: "1",
                  MonId: "PES",
                  CodAutorizacion: "12345678901235",
                  FchVto: "20261007",
                },
              };
            });
            const recovered = await service.reconcile(
              user.id,
              org.id,
              uncertain.id,
            );
            expect(recovered.status).toBe("AUTHORIZED");
            expect(sends).toBe(2);
            expect(
              (await service.reconcile(user.id, org.id, uncertain.id)).cae,
            ).toBe(recovered.cae);
            const audits = await tx.auditLog.findMany({
              where: { organizationId: org.id, entityType: "FISCAL_TRIAL" },
            });
            expect(audits.length).toBe(5);
            expect(JSON.stringify(audits)).not.toContain("fixture-token");
          } finally {
            access.mockRestore();
            points.mockRestore();
          }
          throw rollback;
        },
        { timeout: 20000 },
      ),
    ).rejects.toBe(rollback);
  });
});
