import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { PrismaService } from "../src/prisma/prisma.service";
import { startHttpApp, type HttpApp } from "./support/http-app";

/** La cookie de sesión de una respuesta ("gestion_refresh=..."), si vino. */
const cookieDe = (response: Response) =>
  response.headers.get("set-cookie")?.split(";")[0];

/**
 * Vencimiento y control de sesiones (SISTEMA-93), por HTTP como el navegador:
 * rotación de la clave, varias pestañas a la vez, cookie copiada, inactividad,
 * sesiones abiertas propias y de los usuarios de la farmacia.
 */
describe("sesiones con vencimiento y rotación (HTTP, esquema aislado)", () => {
  let api: HttpApp;
  let db: PrismaService;
  let auth: string;
  const clave = "una-clave-de-prueba-larga";
  const chromeWindows =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
  const DIA = 86_400_000;

  beforeAll(async () => {
    api = await startHttpApp("sesiones_venc");
    db = api.db;
    auth = `${api.base}/auth`;
  }, 100000);
  afterAll(() => api?.close());

  async function usuario(nombre: string) {
    return db.user.create({
      data: {
        email: `${nombre}-${randomUUID()}@example.invalid`,
        passwordHash: await hash(clave),
      },
    });
  }

  async function entrar(email: string, deviceId?: string) {
    const response = await fetch(`${auth}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": chromeWindows,
      },
      body: JSON.stringify({ email, password: clave, deviceId }),
    });
    expect(response.status).toBe(200);
    const { accessToken } = (await response.json()) as { accessToken: string };
    return { cookie: cookieDe(response)!, accessToken, response };
  }

  const renovar = (cookie: string) =>
    fetch(`${auth}/refresh`, {
      method: "POST",
      headers: { Cookie: cookie, "User-Agent": chromeWindows },
    });

  it("rota la clave en cada renovación y la cookie vence por inactividad", async () => {
    const ana = await usuario("ana");
    const { cookie: inicial, response } = await entrar(ana.email);
    // 7 días por defecto, renovados con cada uso (antes 400 días fijos).
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=604800/);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=Strict/);

    const primera = await renovar(inicial);
    expect(primera.status).toBe(200);
    const rotada = cookieDe(primera)!;
    expect(rotada).not.toBe(inicial);
    expect(primera.headers.get("set-cookie")).toMatch(/Max-Age=604800/);

    // Dos pestañas renuevan casi a la vez con la misma clave: las dos andan,
    // y sólo una trae cookie nueva (la otra usó la anterior dentro del margen).
    const [a, b] = await Promise.all([renovar(rotada), renovar(rotada)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([cookieDe(a), cookieDe(b)].filter(Boolean)).toHaveLength(1);

    // 24 h sin internet: vuelve y renueva sin pedir contraseña.
    const sesion = await db.authSession.findFirstOrThrow({
      where: { userId: ana.id },
    });
    await db.authSession.update({
      where: { id: sesion.id },
      data: { lastUsedAt: new Date(Date.now() - DIA) },
    });
    const actual = (cookieDe(a) ?? cookieDe(b))!;
    const vuelta = await renovar(actual);
    expect(vuelta.status).toBe(200);

    // Una PC que no se usó en 10 días: se pide la contraseña.
    await db.authSession.update({
      where: { id: sesion.id },
      data: { lastUsedAt: new Date(Date.now() - 10 * DIA) },
    });
    expect((await renovar(cookieDe(vuelta)!)).status).toBe(401);
  });

  it("una cookie copiada (clave vieja fuera del margen) revoca la sesión y se audita", async () => {
    const org = await db.organization.create({ data: { name: "Copias" } });
    const beto = await usuario("beto");
    await db.userOrganization.create({
      data: { organizationId: org.id, userId: beto.id },
    });
    const { cookie: copiada } = await entrar(beto.email);
    const legitima = await renovar(copiada);
    expect(legitima.status).toBe(200);
    // Pasa el margen de 2 minutos.
    await db.authSession.updateMany({
      where: { userId: beto.id },
      data: { previousTokenValidUntil: new Date(Date.now() - 1000) },
    });
    expect((await renovar(copiada)).status).toBe(401);
    const sesion = await db.authSession.findFirstOrThrow({
      where: { userId: beto.id },
    });
    expect(sesion.revokedAt).not.toBeNull();
    // También queda afuera quien tenía la cookie buena: entra con su clave.
    expect((await renovar(cookieDe(legitima)!)).status).toBe(401);
    const auditoria = await db.auditLog.findFirstOrThrow({
      where: { organizationId: org.id, action: "SESSION_REUSE_DETECTED" },
    });
    expect(auditoria.entityId).toBe(sesion.id);
    expect(JSON.stringify(auditoria)).not.toContain(copiada.split(".")[1]!);
  });

  it("las sesiones que había al publicar no se cortan", async () => {
    const vieja = await usuario("vieja");
    // Una sesión creada como antes de la migración: sin lastUsedAt propio.
    const { cookie } = await entrar(vieja.email);
    await db.$executeRaw`UPDATE "AuthSession" SET "lastUsedAt" = DEFAULT WHERE "userId" = ${vieja.id}::uuid`;
    expect((await renovar(cookie)).status).toBe(200);
  });

  it("lista y cierra las sesiones propias, sin tocar la actual", async () => {
    const caro = await usuario("caro");
    const estaPc = randomUUID();
    const enEsta = await entrar(caro.email, estaPc);
    const enOtra = await entrar(caro.email, randomUUID());
    await entrar(caro.email);
    const conToken = (metodo: string, ruta: string) =>
      fetch(`${auth}/${ruta}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${enEsta.accessToken}` },
      });
    const lista = (await (await conToken("GET", "sessions")).json()) as {
      id: string;
      actual: boolean;
      navegador: string;
      deviceId: string | null;
    }[];
    expect(lista).toHaveLength(3);
    const actual = lista.find(({ actual }) => actual)!;
    expect(actual.deviceId).toBe(estaPc);
    expect(actual.navegador).toBe("Chrome · Windows");

    expect((await conToken("DELETE", `sessions/${actual.id}`)).status).toBe(
      400,
    );
    const otra = lista.find(
      ({ actual, deviceId }) => !actual && deviceId !== null,
    )!;
    expect((await conToken("DELETE", `sessions/${otra.id}`)).status).toBe(200);
    expect((await renovar(enOtra.cookie)).status).toBe(401);

    const resto = await conToken("POST", "sessions/close-others");
    expect(await resto.json()).toEqual({ cerradas: 1 });
    expect(await (await conToken("GET", "sessions")).json()).toHaveLength(1);
    expect((await renovar(enEsta.cookie)).status).toBe(200);
  });

  it("el administrador ve y cierra las sesiones de su farmacia, no las de otra", async () => {
    const permisos = await Promise.all(
      ["USER_READ", "USER_MANAGE"].map((code) =>
        db.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: code },
        }),
      ),
    );
    async function farmacia(nombre: string) {
      const org = await db.organization.create({ data: { name: nombre } });
      const branch = await db.branch.create({
        data: { organizationId: org.id, name: "Centro", code: "CEN" },
      });
      const owner = await db.role.create({
        data: {
          organizationId: org.id,
          name: "Dueño",
          code: "OWNER",
          permissions: {
            create: permisos.map(({ id }) => ({ permissionId: id })),
          },
        },
      });
      const cajeroRol = await db.role.create({
        data: { organizationId: org.id, name: "Cajero", code: "CAJERO" },
      });
      const miembro = async (nombreUsuario: string, roleId: string) => {
        const user = await usuario(nombreUsuario);
        await db.userOrganization.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            roles: { create: { roleId } },
          },
        });
        await db.userBranch.create({
          data: { userId: user.id, branchId: branch.id },
        });
        return user;
      };
      return {
        org,
        branch,
        cajeroRol,
        duena: await miembro("duena", owner.id),
        cajero: await miembro("cajero", cajeroRol.id),
      };
    }
    const propia = await farmacia("Propia");
    const ajena = await farmacia("Ajena");
    const duena = await entrar(propia.duena.email);
    const cajero = await entrar(propia.cajero.email);
    await entrar(propia.cajero.email);
    const usuarios = (org: string) => `${api.base}/organizations/${org}/users`;
    const comoDuena = (metodo: string, url: string, body?: unknown) =>
      fetch(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${duena.accessToken}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

    const lista = (await (
      await comoDuena(
        "GET",
        `${usuarios(propia.org.id)}/${propia.cajero.id}/sessions`,
      )
    ).json()) as { id: string; actual: boolean }[];
    expect(lista).toHaveLength(2);
    expect(lista.some(({ actual }) => actual)).toBe(false);

    // No puede ver ni cerrar las de otra farmacia.
    expect(
      (
        await comoDuena(
          "GET",
          `${usuarios(ajena.org.id)}/${ajena.cajero.id}/sessions`,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await comoDuena(
          "POST",
          `${usuarios(propia.org.id)}/${ajena.cajero.id}/sessions/close-all`,
        )
      ).status,
    ).toBe(404);

    const una = await comoDuena(
      "DELETE",
      `${usuarios(propia.org.id)}/${propia.cajero.id}/sessions/${lista[0]!.id}`,
    );
    expect(await una.json()).toEqual({ cerradas: 1 });
    const todas = await comoDuena(
      "POST",
      `${usuarios(propia.org.id)}/${propia.cajero.id}/sessions/close-all`,
    );
    expect(await todas.json()).toEqual({ cerradas: 1 });
    expect((await renovar(cajero.cookie)).status).toBe(401);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: propia.org.id,
          action: "SESSION_REVOKED_BY_ADMIN",
        },
      }),
    ).toBe(2);

    // Desactivarlo le corta el acceso al momento.
    const nueva = await entrar(propia.cajero.email);
    const baja = await comoDuena(
      "PATCH",
      `${usuarios(propia.org.id)}/${propia.cajero.id}`,
      {
        active: false,
        roleIds: [propia.cajeroRol.id],
        branchIds: [propia.branch.id],
      },
    );
    expect(baja.status).toBe(200);
    expect((await renovar(nueva.cookie)).status).toBe(401);
  });
});
