import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import * as cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { errorDeValidacion } from "../src/common/http/mensajes-validacion";
import type { EnvironmentService } from "../src/config/environment.service";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Sesión de otro usuario en otra pestaña (SISTEMA-92), por HTTP como el
 * navegador: la cookie del navegador ya es del dueño y la pestaña del cajero
 * pide renovar diciendo que espera al cajero.
 */
describe("renovación con usuario esperado (HTTP, esquema aislado)", () => {
  let app: INestApplication;
  let db: PrismaService;
  let base: string;
  const schema = `sesion_otro_${randomUUID().replaceAll("-", "")}`;
  const clave = "una-clave-de-prueba-larga";

  beforeAll(async () => {
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
      throw new Error("Could not prepare isolated schema");
    db = new PrismaService({
      databaseUrl: url.toString(),
    } as EnvironmentService);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: errorDeValidacion,
      }),
    );
    await app.listen(0, "127.0.0.1");
    base = `${await app.getUrl()}/api/v1/auth`;
  }, 100000);

  afterAll(async () => {
    await app?.close();
    if (/^sesion_otro_[a-f0-9]{32}$/.test(schema)) {
      await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await db?.$disconnect();
  });

  async function entrar(email: string) {
    const response = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: clave }),
    });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")!.split(";")[0]!;
  }

  const renovar = (cookie: string, usuarioEsperado?: string) =>
    fetch(`${base}/refresh`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(usuarioEsperado ? { usuarioEsperado } : {}),
    });

  it("no le entrega a la pestaña del cajero el token del dueño", async () => {
    const passwordHash = await hash(clave);
    const [cajero, duena] = await Promise.all(
      ["cajero", "duena"].map((nombre) =>
        db.user.create({
          data: {
            email: `${nombre}-${randomUUID()}@example.invalid`,
            passwordHash,
          },
        }),
      ),
    );
    await entrar(cajero!.email);
    // La dueña entra en otra pestaña: la cookie del navegador pasa a ser suya.
    const cookie = await entrar(duena!.email);

    const pausada = await renovar(cookie, cajero!.id);
    expect(pausada.status).toBe(409);
    expect(pausada.headers.get("set-cookie")).toBeNull();
    expect(await pausada.json()).toMatchObject({
      code: "SESION_DE_OTRO_USUARIO",
      details: { email: duena!.email },
    });
    expect(
      await db.authSession.count({
        where: { userId: duena!.id, revokedAt: { not: null } },
      }),
    ).toBe(0);

    // La pestaña de la dueña sigue andando, con o sin usuario esperado.
    const propia = await renovar(cookie, duena!.id);
    expect(propia.status).toBe(200);
    expect(await propia.json()).toHaveProperty("accessToken");
    expect((await renovar(cookie)).status).toBe(200);
    // Una web vieja renueva sin cuerpo: sigue andando como antes.
    expect(
      (
        await fetch(`${base}/refresh`, {
          method: "POST",
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(200);

    // Una cookie inválida sigue siendo 401 y un id mal formado, 400.
    expect((await renovar("gestion_refresh=no-vale", duena!.id)).status).toBe(
      401,
    );
    expect(
      (
        await fetch(`${base}/refresh`, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ usuarioEsperado: "cajero" }),
        })
      ).status,
    ).toBe(400);
  });
});
