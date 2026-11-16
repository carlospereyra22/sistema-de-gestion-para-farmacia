import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";

import { AppModule } from "../src/app.module";
import type { EnvironmentService } from "../src/config/environment.service";
import { PlatformBillingService } from "../src/platform/platform-billing.service";
import { PlatformOrganizationsService } from "../src/platform/platform-organizations.service";
import { PrismaService } from "../src/prisma/prisma.service";

/** Módulo Catálogo online desde el panel de plataforma (SISTEMA-107). */
describe("módulos de una farmacia en la plataforma", () => {
  let app: TestingModule, db: PrismaService;
  let plataforma: PlatformOrganizationsService;
  const schema = `platform_modulos_${randomUUID().replaceAll("-", "")}`;

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
    plataforma = new PlatformOrganizationsService(
      db,
      new PlatformBillingService(db),
    );
  }, 100000);

  afterAll(async () => {
    await db?.$disconnect();
    if (app && /^platform_modulos_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  it("el detalle muestra el módulo y el switch lo cambia con auditoría", async () => {
    const org = await db.organization.create({ data: { name: "Farmacia" } });
    const admin = await db.user.create({
      data: { email: randomUUID() + "@example.invalid", passwordHash: "x" },
    });
    // Viene apagado.
    expect((await plataforma.detail(org.id)).catalogEnabled).toBe(false);

    await plataforma.updateModules(admin.id, org.id, { catalogEnabled: true });
    expect((await plataforma.detail(org.id)).catalogEnabled).toBe(true);

    await plataforma.updateModules(admin.id, org.id, { catalogEnabled: false });
    expect((await plataforma.detail(org.id)).catalogEnabled).toBe(false);

    const auditoria = await db.platformAuditLog.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(auditoria.map((a) => a.action)).toEqual([
      "PLATFORM_CATALOG_ENABLED",
      "PLATFORM_CATALOG_DISABLED",
    ]);
  });
});
