import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { ReportAccessService } from "../src/reports/report-access.service";

describe("report access isolated schema", () => {
  let app: TestingModule, db: PrismaService, reports: ReportAccessService;
  const schema = `report_access_${randomUUID().replaceAll("-", "")}`;
  const now = new Date("2026-10-31T15:00:00Z");
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local test DB only");
    url.searchParams.set("schema", schema);
    const result = spawnSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        timeout: 90000,
        stdio: "pipe",
      },
    );
    if (result.status !== 0)
      throw new Error(
        "Could not prepare isolated schema: " +
          String(result.stderr).replaceAll(url.toString(), "[database]"),
      );
    db = new PrismaService({
      databaseUrl: url.toString(),
    } as EnvironmentService);
    await db.$connect();
    reports = new ReportAccessService(db);
  }, 100000);
  afterAll(async () => {
    await db?.$disconnect();
    if (app && /^report_access_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  /** Organizacion con tres sucursales (una inactiva) y un usuario asignado a `assigned`. */
  async function fixture(permissionCodes: string[], assigned: number[]) {
    const org = await db.organization.create({ data: { name: "Reportes" } });
    const branches = await Promise.all(
      ["Centro", "Norte", "Cerrada"].map((name, index) =>
        db.branch.create({
          data: {
            organizationId: org.id,
            name,
            code: `B${index}`,
            active: name !== "Cerrada",
          },
        }),
      ),
    );
    const user = await db.user.create({
      data: { email: randomUUID() + "@example.invalid", passwordHash: "x" },
    });
    // REPORT_READ y otros permisos base los crea el seed, no las migraciones.
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        db.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: code },
        }),
      ),
    );
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        code: "CUSTOM",
        name: "Test",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await db.userOrganization.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        roles: { create: { roleId: role.id } },
      },
    });
    for (const index of assigned)
      await db.userBranch.create({
        data: { userId: user.id, branchId: branches[index]!.id },
      });
    return { org, branches, user };
  }

  it("la migracion crea los permisos nuevos", async () => {
    const codes = await db.permission.findMany({
      where: { code: { in: ["REPORT_PROFIT_READ", "REPORT_EXPORT"] } },
    });
    expect(codes.map((p) => p.code).sort()).toEqual([
      "REPORT_EXPORT",
      "REPORT_PROFIT_READ",
    ]);
  });

  it("todas las sucursales = solo las asignadas y activas", async () => {
    const { org, branches, user } = await fixture(["REPORT_READ"], [0, 2]);
    const scope = await reports.scope(user.id, org.id, {}, now);
    expect(scope.branchIds).toEqual([branches[0]!.id]);
  });

  it("una sucursal nueva asignada aparece sola en todas", async () => {
    const { org, branches, user } = await fixture(["REPORT_READ"], [0]);
    await db.userBranch.create({
      data: { userId: user.id, branchId: branches[1]!.id },
    });
    const scope = await reports.scope(
      user.id,
      org.id,
      { branchId: "all" },
      now,
    );
    expect(scope.branchIds.sort()).toEqual(
      [branches[0]!.id, branches[1]!.id].sort(),
    );
  });

  it("rechaza una sucursal no asignada, inactiva o de otra organizacion", async () => {
    const { org, branches, user } = await fixture(["REPORT_READ"], [0, 2]);
    const other = await fixture(["REPORT_READ"], [0]);
    for (const branchId of [
      branches[1]!.id,
      branches[2]!.id,
      other.branches[0]!.id,
    ])
      await expect(
        reports.scope(user.id, org.id, { branchId }, now),
      ).rejects.toThrow(ForbiddenException);
  });

  it("sin REPORT_READ no ve reportes", async () => {
    const { org, branches, user } = await fixture(["SALE_READ"], [0]);
    await expect(
      reports.scope(user.id, org.id, { branchId: branches[0]!.id }, now),
    ).rejects.toThrow(ForbiddenException);
    await expect(reports.filterOptions(user.id, org.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("un usuario de otra organizacion no puede usarla", async () => {
    const { org } = await fixture(["REPORT_READ"], [0]);
    const other = await fixture(["REPORT_READ"], [0]);
    await expect(reports.filterOptions(other.user.id, org.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("las opciones respetan sucursales y permisos", async () => {
    const limited = await fixture(["REPORT_READ"], [0]);
    await db.supplier.create({
      data: { organizationId: limited.org.id, name: "Drogueria" },
    });
    const options = await reports.filterOptions(
      limited.user.id,
      limited.org.id,
    );
    expect(options.branches).toEqual([
      { id: limited.branches[0]!.id, name: "Centro" },
    ]);
    expect(options.suppliers).toEqual([]);
    expect(options.access).toEqual({
      profitability: false,
      purchases: false,
      customers: false,
      export: false,
    });

    const full = await fixture(
      [
        "REPORT_READ",
        "REPORT_PROFIT_READ",
        "REPORT_EXPORT",
        "PURCHASE_READ",
        "ACCOUNT_READ",
      ],
      [0, 1],
    );
    await db.supplier.create({
      data: { organizationId: full.org.id, name: "Drogueria" },
    });
    const fullOptions = await reports.filterOptions(full.user.id, full.org.id);
    expect(fullOptions.branches.map((b) => b.name)).toEqual([
      "Centro",
      "Norte",
    ]);
    expect(fullOptions.suppliers.map((s) => s.name)).toEqual(["Drogueria"]);
    expect(fullOptions.access).toEqual({
      profitability: true,
      purchases: true,
      customers: true,
      export: true,
    });
  });
});
