import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as cookieParser from "cookie-parser";
import { AppModule } from "../../src/app.module";
import { ApiExceptionFilter } from "../../src/common/http/api-exception.filter";
import { requestIdMiddleware } from "../../src/common/http/request-id.middleware";
import type { EnvironmentService } from "../../src/config/environment.service";
import { PrismaService } from "../../src/prisma/prisma.service";

/**
 * Levanta la API real sobre un esquema aislado de `gestion_dev`, con la misma configuración
 * que `main.ts`, para probar guards, pipes y filtro de errores juntos por HTTP.
 */
export async function startHttpApp(prefix: string) {
  process.env.PRICE_REFRESH_SCHEDULER = "off";
  process.env.SUBSCRIPTION_SCHEDULER = "off";
  process.env.FISCAL_QUEUE_WORKER = "off";
  const schema = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  const main = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
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
  const db = new PrismaService({
    databaseUrl: url.toString(),
  } as EnvironmentService);
  await db.$connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(db)
    .compile();
  const app = moduleRef.createNestApplication();
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
  const base = (await app.getUrl()).replace("[::1]", "127.0.0.1");

  const request = (
    path: string,
    token?: string,
    body?: object,
    method = body ? "POST" : "GET",
  ) =>
    fetch(`${base}/api/v1${path}`, {
      method,
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
    if (response.status !== 200)
      throw new Error(`Login rechazado: ${response.status}`);
    return ((await response.json()) as { accessToken: string }).accessToken;
  };

  const close = async () => {
    await app.close();
    await db.$disconnect();
    if (new RegExp(`^${prefix}_[a-f0-9]{32}$`).test(schema))
      await main
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await main.close();
  };

  return { app, db, request, login, close };
}

export type HttpApp = Awaited<ReturnType<typeof startHttpApp>>;
