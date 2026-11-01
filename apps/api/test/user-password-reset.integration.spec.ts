import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { verify } from "@node-rs/argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { UsersService } from "../src/users/users.service";

describe("admin password reset isolated schema", () => {
  let app: TestingModule, db: PrismaService, users: UsersService;
  const schema = `password_reset_${randomUUID().replaceAll("-", "")}`;
  const newPassword = "nueva-clave-segura-123";
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
    users = new UsersService(db);
  }, 100000);
  afterAll(async () => {
    await db?.$disconnect();
    if (app && /^password_reset_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  /** Farmacia con roles OWNER (con USER_MANAGE), ADMIN (con USER_MANAGE) y USER. */
  async function pharmacy() {
    const org = await db.organization.create({ data: { name: "Reset" } });
    const manage = await db.permission.upsert({
      where: { code: "USER_MANAGE" },
      update: {},
      create: { code: "USER_MANAGE", description: "USER_MANAGE" },
    });
    const role = (code: string, canManage: boolean) =>
      db.role.create({
        data: {
          organizationId: org.id,
          code,
          name: code,
          permissions: canManage
            ? { create: { permissionId: manage.id } }
            : undefined,
        },
      });
    const roles = {
      OWNER: await role("OWNER", true),
      ADMIN: await role("ADMIN", true),
      USER: await role("USER", false),
    };
    const member = async (
      code: keyof typeof roles,
      organizationId = org.id,
    ) => {
      const user = await db.user.create({
        data: {
          email: randomUUID() + "@example.invalid",
          passwordHash: "vieja",
        },
      });
      await db.userOrganization.create({
        data: {
          userId: user.id,
          organizationId,
          roles: { create: { roleId: roles[code].id } },
        },
      });
      return user.id;
    };
    return { org, member };
  }

  it("el admin restablece, se cierran las sesiones y queda auditado", async () => {
    const { org, member } = await pharmacy();
    const admin = await member("ADMIN");
    const cashier = await member("USER");
    await db.authSession.createMany({
      data: [
        { userId: cashier, tokenHash: randomUUID() },
        { userId: cashier, tokenHash: randomUUID() },
      ],
    });
    await expect(
      users.resetPassword(admin, org.id, cashier, newPassword),
    ).resolves.toEqual({ revokedSessions: 2 });
    const user = await db.user.findUniqueOrThrow({ where: { id: cashier } });
    expect(await verify(user.passwordHash, newPassword)).toBe(true);
    expect(
      await db.authSession.count({
        where: { userId: cashier, revokedAt: null },
      }),
    ).toBe(0);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: cashier, action: "PASSWORD_RESET_BY_ADMIN" },
    });
    expect(JSON.stringify(audit)).not.toContain(newPassword);
  });

  it("no permite la propia contrasena", async () => {
    const { org, member } = await pharmacy();
    const admin = await member("ADMIN");
    await expect(
      users.resetPassword(admin, org.id, admin, newPassword),
    ).rejects.toThrow(ForbiddenException);
  });

  it("la de un dueno solo la cambia otro dueno", async () => {
    const { org, member } = await pharmacy();
    const owner = await member("OWNER");
    const secondOwner = await member("OWNER");
    const admin = await member("ADMIN");
    await expect(
      users.resetPassword(admin, org.id, owner, newPassword),
    ).rejects.toThrow("otro dueño");
    await expect(
      users.resetPassword(secondOwner, org.id, owner, newPassword),
    ).resolves.toEqual({ revokedSessions: 0 });
  });

  it("no toca usuarios que tambien estan en otra farmacia", async () => {
    const { org, member } = await pharmacy();
    const other = await pharmacy();
    const admin = await member("ADMIN");
    const shared = await member("USER");
    await db.userOrganization.create({
      data: { userId: shared, organizationId: other.org.id },
    });
    await expect(
      users.resetPassword(admin, org.id, shared, newPassword),
    ).rejects.toThrow("otra farmacia");
    const user = await db.user.findUniqueOrThrow({ where: { id: shared } });
    expect(user.passwordHash).toBe("vieja");
  });

  it("sin USER_MANAGE o de otra organizacion no puede", async () => {
    const { org, member } = await pharmacy();
    const cashier = await member("USER");
    const target = await member("USER");
    await expect(
      users.resetPassword(cashier, org.id, target, newPassword),
    ).rejects.toThrow(ForbiddenException);
    const other = await pharmacy();
    const outsiderAdmin = await other.member("ADMIN");
    await expect(
      users.resetPassword(outsiderAdmin, other.org.id, target, newPassword),
    ).rejects.toThrow("no pertenece");
  });
});
