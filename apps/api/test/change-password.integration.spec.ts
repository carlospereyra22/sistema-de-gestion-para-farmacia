import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import * as cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { requestIdMiddleware } from "../src/common/http/request-id.middleware";
import type { EnvironmentService } from "../src/config/environment.service";
import { PrismaService } from "../src/prisma/prisma.service";

describe("cambio de contraseña por HTTP (esquema aislado)", () => {
  const schema = `change_password_${randomUUID().replaceAll("-", "")}`;
  const temporary = "clave-temporal-12345";
  const chosen = "clave-elegida-678901";
  let moduleRef: TestingModule;
  let main: TestingModule;
  let app: INestApplication;
  let db: PrismaService;
  let base: string;

  beforeAll(async () => {
    process.env.PRICE_REFRESH_SCHEDULER = "off";
    main = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Solo base local de desarrollo");
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
        "No se pudo preparar el esquema aislado: " +
          String(result.stderr).replaceAll(url.toString(), "[database]"),
      );
    db = new PrismaService({
      databaseUrl: url.toString(),
    } as EnvironmentService);
    await db.$connect();
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.use(requestIdMiddleware);
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  }, 100000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (main && /^change_password_[a-f0-9]{32}$/.test(schema))
      await main
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await main?.close();
  });

  const request = (path: string, token?: string, body?: object) =>
    fetch(`${base}/api/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  const login = async (email: string, password: string) => {
    const response = await request("/auth/login", undefined, {
      email,
      password,
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { accessToken: string }).accessToken;
  };

  /** Usuario con clave temporal; con farmacia salvo que se pida lo contrario. */
  async function account(mustChangePassword: boolean, withOrganization = true) {
    const email = `${randomUUID()}@example.invalid`;
    const user = await db.user.create({
      data: {
        email,
        passwordHash: await hash(temporary),
        mustChangePassword,
      },
    });
    if (!withOrganization) return { email, user, rolesPath: "" };
    const organization = await db.organization.create({
      data: { name: "Farmacia" },
    });
    const permission = await db.permission.upsert({
      where: { code: "ROLE_READ" },
      update: {},
      create: { code: "ROLE_READ", description: "ROLE_READ" },
    });
    const role = await db.role.create({
      data: {
        organizationId: organization.id,
        code: "OWNER",
        name: "Owner",
        permissions: { create: { permissionId: permission.id } },
      },
    });
    await db.userOrganization.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        roles: { create: { roleId: role.id } },
      },
    });
    return {
      email,
      user,
      organization,
      rolesPath: `/organizations/${organization.id}/roles`,
    };
  }

  it("con el cambio pendiente solo deja ver el perfil y bloquea el resto", async () => {
    const { email, rolesPath } = await account(true);
    const token = await login(email, temporary);

    const me = await request("/auth/me", token);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ mustChangePassword: true });

    const blocked = await request(rolesPath, token);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  });

  it("un usuario sin cambio pendiente sigue operando igual", async () => {
    const { email, rolesPath } = await account(false);
    const token = await login(email, temporary);

    expect((await request(rolesPath, token)).status).toBe(200);
  });

  it("la clave actual incorrecta no cambia nada ni cierra la sesión", async () => {
    const { email, user } = await account(true);
    const token = await login(email, temporary);

    const response = await request("/auth/change-password", token, {
      currentPassword: "otra-clave-cualquiera",
      newPassword: chosen,
    });

    expect(response.status).toBe(400);
    expect((await request("/auth/me", token)).status).toBe(200);
    await expect(
      db.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).resolves.toMatchObject({ mustChangePassword: true });
    await login(email, temporary);
  });

  it.each([
    ["igual a la actual", temporary],
    ["de menos de 12 caracteres", "corta"],
  ])("rechaza una clave nueva %s", async (_name, newPassword) => {
    const { email } = await account(true);
    const token = await login(email, temporary);

    const response = await request("/auth/change-password", token, {
      currentPassword: temporary,
      newPassword,
    });

    expect(response.status).toBe(400);
  });

  it("al cambiarla libera el acceso, cierra las otras sesiones y audita", async () => {
    const { email, user, organization, rolesPath } = await account(true);
    const current = await login(email, temporary);
    const other = await login(email, temporary);

    const response = await request("/auth/change-password", current, {
      currentPassword: temporary,
      newPassword: chosen,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revokedSessions: 1 });
    expect((await request(rolesPath, current)).status).toBe(200);
    expect((await request("/auth/me", other)).status).toBe(401);
    expect(
      (
        await request("/auth/login", undefined, {
          email,
          password: temporary,
        })
      ).status,
    ).toBe(401);
    await login(email, chosen);

    const audit = await db.auditLog.findMany({
      where: { organizationId: organization!.id, entityId: user.id },
    });
    expect(audit.map((row) => row.action)).toEqual([
      "PASSWORD_CHANGED_BY_USER",
    ]);
    expect(JSON.stringify(audit)).not.toContain(chosen);
    expect(JSON.stringify(audit)).not.toContain(temporary);
  });

  it("también funciona para un usuario sin farmacia", async () => {
    const { email } = await account(true, false);
    const token = await login(email, temporary);

    const response = await request("/auth/change-password", token, {
      currentPassword: temporary,
      newPassword: chosen,
    });

    expect(response.status).toBe(200);
  });

  it("sin sesión no se puede cambiar", async () => {
    const response = await request("/auth/change-password", undefined, {
      currentPassword: temporary,
      newPassword: chosen,
    });

    expect(response.status).toBe(401);
  });
});
