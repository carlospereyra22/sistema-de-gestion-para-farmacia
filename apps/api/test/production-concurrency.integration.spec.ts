import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { ProductionSalesService } from "../src/fiscal/production-sales.service";
import type { ProductionConfigurationService } from "../src/fiscal/production-configuration.service";
import type { OrganizationsService } from "../src/organizations/organizations.service";
import type { ArcaConnectionService } from "../src/fiscal/arca-connection.service";
import { ArcaSoap } from "../src/fiscal/arca-soap";

describe("production point concurrency using independent PostgreSQL connections", () => {
  let app: TestingModule;
  let first: PrismaService;
  let second: PrismaService;
  const schema = `fiscal_concurrency_${randomUUID().replaceAll("-", "")}`;
  const previous = process.env.FISCAL_PRODUCTION_ISSUANCE;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local development DB only");
    url.searchParams.set("schema", schema);
    const migrated = spawnSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        timeout: 90000,
        stdio: "pipe",
      },
    );
    if (migrated.status !== 0)
      throw new Error("Could not prepare isolated concurrency schema");
    const environment = { databaseUrl: url.toString() } as EnvironmentService;
    first = new PrismaService(environment);
    second = new PrismaService(environment);
    await Promise.all([first.$connect(), second.$connect()]);
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
  }, 100000);
  afterAll(async () => {
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
    // Only synthetic fixtures in the freshly generated schema are removed.
    if (app && /^fiscal_concurrency_[a-f0-9]{32}$/.test(schema)) {
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await app?.close();
    if (previous === undefined) delete process.env.FISCAL_PRODUCTION_ISSUANCE;
    else process.env.FISCAL_PRODUCTION_ISSUANCE = previous;
    jest.restoreAllMocks();
  });
  it("does not send again or reserve another number while the other client awaits ARCA", async () => {
    const org = await first.organization.create({
      data: { name: "Isolated concurrency fixture" },
    });
    const branch = await first.branch.create({
      data: { organizationId: org.id, name: "Fixture", code: "FIX" },
    });
    const actor = await first.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        passwordHash: "fixture",
      },
    });
    const seed = async () => {
      const sale = await first.sale.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          status: "COMPLETED",
          documentType: "INVOICE",
          totalMinor: 10000n,
        },
      });
      await first.fiscalDocument.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          sourceSaleId: sale.id,
          requestId: sale.id,
          environment: "PRODUCTION",
          kind: "INVOICE",
          issuerCuit: "20247237837",
          point: 99997,
          voucherType: 11,
          date: "20261003",
          totalMinor: 10000,
          docType: 99,
          docNumber: "0",
          recipientVatId: 5,
          issuer: {},
          saleSnapshot: {},
        },
      });
      return sale;
    };
    const a = await seed(),
      b = await seed();
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    let last = 0,
      sends = 0;
    const soap = new ArcaSoap();
    jest
      .spyOn(soap, "call")
      .mockImplementation(async (_kind, operation, body, environment) => {
        expect(environment).toBe("PRODUCTION");
        const value = (tag: string) =>
          new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(body)?.[1] ?? "";
        if (operation === "FECompUltimoAutorizado")
          return { CbteNro: String(last), PtoVta: "99997", CbteTipo: "11" };
        if (operation !== "FECAESolicitar")
          throw new Error("Unexpected external operation");
        sends++;
        started();
        await waiting;
        last = Number(value("CbteDesde"));
        return {
          FeCabResp: {
            Cuit: "20247237837",
            PtoVta: "99997",
            CbteTipo: "11",
            CantReg: "1",
            Resultado: "A",
          },
          FeDetResp: {
            FECAEDetResponse: {
              Resultado: "A",
              CbteDesde: String(last),
              CbteHasta: String(last),
              CbteFch: value("CbteFch"),
              DocTipo: "99",
              DocNro: "0",
              CAE: "12345678901234",
              CAEFchVto: "20990101",
            },
          },
        };
      });
    const config = {
      validate: jest.fn().mockResolvedValue({}),
    } as unknown as ProductionConfigurationService;
    const auth = {
      authorizeFiscalSale: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationsService;
    const connection = {
      access: jest.fn().mockResolvedValue({
        environment: "PRODUCTION",
        cuit: "20247237837",
        token: "fixture",
        sign: "fixture",
      }),
      points: jest.fn().mockResolvedValue([{ number: 99997 }]),
    } as unknown as ArcaConnectionService;
    const one = new ProductionSalesService(
      first,
      config,
      connection,
      soap,
      auth,
    );
    const two = new ProductionSalesService(
      second,
      config,
      connection,
      soap,
      auth,
    );
    const initial = one.process(actor.id, org.id, branch.id, a.id);
    try {
      await sending;
      await expect(
        two.process(actor.id, org.id, branch.id, a.id),
      ).rejects.toThrow("dos minutos");
      const held = await two.process(actor.id, org.id, branch.id, b.id);
      expect(held.status).toBe("QUEUED");
      expect(held.number).toBeNull();
      expect(sends).toBe(1);
    } finally {
      release();
    }
    const authorized = await initial;
    expect(authorized.status).toBe("AUTHORIZED");
    expect(authorized.number).toBe(1);
    const next = await two.process(actor.id, org.id, branch.id, b.id);
    expect(next.status).toBe("AUTHORIZED");
    expect(next.number).toBe(2);
    expect(sends).toBe(2);
    await Promise.all([
      one.process(actor.id, org.id, branch.id, a.id),
      two.process(actor.id, org.id, branch.id, a.id),
    ]);
    expect(sends).toBe(2);
  }, 30000);
});
