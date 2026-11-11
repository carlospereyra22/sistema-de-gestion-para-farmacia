import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { errorDeValidacion } from "../src/common/http/mensajes-validacion";
import type { EnvironmentService } from "../src/config/environment.service";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * La API real escuchando en un puerto libre, sobre un esquema aislado de la
 * base local gestion_dev que se borra al terminar. Sirve para probar por HTTP
 * lo que hace el navegador (cookies, encabezados), sin dependencias nuevas.
 */
export async function levantarApiAislada(prefijo: string) {
  const schema = `${prefijo}_${randomUUID().replaceAll("-", "")}`;
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
  if (result.status !== 0) throw new Error("Could not prepare isolated schema");
  const db = new PrismaService({
    databaseUrl: url.toString(),
  } as EnvironmentService);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(db)
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
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
  const base = `${await app.getUrl()}/api/v1`;
  const nombreValido = new RegExp(`^${prefijo}_[a-f0-9]{32}$`);
  return {
    base,
    db,
    async cerrar() {
      await app.close();
      if (nombreValido.test(schema))
        await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.$disconnect();
    },
  };
}

/** La cookie de sesión de una respuesta ("gestion_refresh=..."), si vino. */
export function cookieDe(response: Response): string | undefined {
  return response.headers.get("set-cookie")?.split(";")[0];
}
