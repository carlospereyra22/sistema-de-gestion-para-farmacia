import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import {
  createPlatformAdmin,
  listPlatformAdmins,
  PlatformCommandError,
  resetPlatformCode,
  revokePlatformAdmin,
} from "../src/platform/platform-admin.commands";
import { totpCode, totpStep } from "../src/platform/totp";
import { startHttpApp, type HttpApp } from "./support/http-app";

describe("identidad de plataforma por HTTP (esquema aislado)", () => {
  const password = "clave-de-plataforma-1234";
  let http: HttpApp;
  const secretos = new Map<string, string>();

  beforeAll(async () => {
    process.env.FISCAL_VAULT_KEY = "ab".repeat(32);
    http = await startHttpApp("platform_identity");
  }, 100000);

  afterAll(async () => {
    await http?.close();
    delete process.env.FISCAL_VAULT_KEY;
  });

  async function admin() {
    const email = `${randomUUID()}@example.invalid`;
    await createPlatformAdmin(http.db, email, await hash(password));
    return { email, token: await http.login(email, password) };
  }

  /**
   * Pedido al panel desde una pestaña: con el token de plataforma que recibió
   * esa pestaña al ingresar el código (SISTEMA-94), si lo tiene.
   */
  const panel = (
    path: string,
    token: string,
    plataforma?: string,
    body?: object,
    method?: string,
  ) =>
    http.request(path, token, body, method, {
      "X-Plataforma": plataforma ?? "",
    });

  /** Cuenta con el código ya configurado y esta pestaña verificada. */
  async function enrolledAdmin() {
    const account = await admin();
    const secret = await enroll(account.token);
    secretos.set(account.email, secret);
    const step = totpStep(new Date());
    const response = await confirm(account.token, totpCode(secret, step));
    expect(response.status).toBe(200);
    const { token: plataforma } = (await response.json()) as {
      token: string;
    };
    return { ...account, secret, step, plataforma };
  }

  async function enroll(token: string) {
    const response = await http.request("/platform/totp/enroll", token, {});
    expect(response.status).toBe(200);
    return ((await response.json()) as { secret: string }).secret;
  }

  const confirm = (token: string, code: string) =>
    http.request("/platform/totp/confirm", token, { code });

  const verify = (token: string, code: string) =>
    http.request("/platform/totp/verify", token, { code });

  async function pharmacyUser() {
    const email = `${randomUUID()}@example.invalid`;
    const organization = await http.db.organization.create({
      data: { name: "Farmacia" },
    });
    await http.db.user.create({
      data: {
        email,
        passwordHash: await hash(password),
        organizations: { create: { organizationId: organization.id } },
      },
    });
    return { email, token: await http.login(email, password) };
  }

  /** Lo que ve quien no tiene acceso, sin el id de pedido ni la ruta. */
  async function hiddenShape(response: Response, path: string) {
    const body = (await response.json()) as Record<string, string>;
    return {
      status: response.status,
      code: body.code,
      message: body.message?.replace(path, "<ruta>"),
    };
  }

  describe("para cualquiera que no sea administrador, no existe", () => {
    const routes = [
      ["/platform/session", undefined],
      ["/platform/audit", undefined],
      ["/platform/totp/enroll", {}],
      ["/platform/totp/verify", { code: "123456" }],
    ] as const;

    it.each(routes)(
      "%s responde igual que una ruta inexistente",
      async (path, body) => {
        const missing = "/platform/no-existe-esta-ruta";
        const reference = await hiddenShape(
          await http.request(missing, undefined, body),
          `/api/v1${missing}`,
        );
        expect(reference.status).toBe(404);

        const { token } = await pharmacyUser();
        for (const candidate of [undefined, token, "token-invalido"])
          expect(
            await hiddenShape(
              await http.request(path, candidate, body),
              `/api/v1${path}`,
            ),
          ).toEqual(reference);
      },
    );

    it("un usuario de farmacia no figura como administrador", async () => {
      const { token } = await pharmacyUser();
      const me = await http.request("/auth/me", token);
      expect(await me.json()).toMatchObject({ isPlatformAdmin: false });
    });
  });

  it("sin el código no ve datos, aunque sea administrador", async () => {
    const { token } = await admin();

    const session = await http.request("/platform/session", token);
    expect(await session.json()).toEqual({ enrolled: false, verified: false });

    const audit = await http.request("/platform/audit", token);
    expect(audit.status).toBe(403);
    expect(await audit.json()).toMatchObject({
      code: "PLATFORM_VERIFICATION_REQUIRED",
    });
  });

  it("al confirmar el código entra, y el secreto queda cifrado", async () => {
    const { email, token, secret, plataforma } = await enrolledAdmin();

    expect((await panel("/platform/audit", token, plataforma)).status).toBe(
      200,
    );
    expect(
      await (await panel("/platform/session", token, plataforma)).json(),
    ).toEqual({ enrolled: true, verified: true });

    const stored = await http.db.platformAdmin.findFirstOrThrow({
      where: { user: { email } },
    });
    expect(stored.totpSecret).not.toContain(secret);

    const me = await http.request("/auth/me", token);
    const body = await me.text();
    expect(JSON.parse(body)).toMatchObject({ isPlatformAdmin: true });
    expect(body).not.toContain(secret);
    expect(body).not.toContain("totpSecret");
    expect(body).not.toContain(stored.totpSecret);
  });

  it("no deja volver a enrolarse con un código ya confirmado", async () => {
    const { token } = await enrolledAdmin();

    const response = await http.request("/platform/totp/enroll", token, {});

    expect(response.status).toBe(409);
  });

  it("un código no se puede usar dos veces", async () => {
    const { email, secret, step } = await enrolledAdmin();
    const other = await http.login(email, password);

    expect((await verify(other, totpCode(secret, step))).status).toBe(400);
    expect((await http.request("/platform/audit", other)).status).toBe(403);
    const ok = await verify(other, totpCode(secret, step + 1));
    expect(ok.status).toBe(200);
    const { token: plataforma } = (await ok.json()) as { token: string };
    expect((await panel("/platform/audit", other, plataforma)).status).toBe(
      200,
    );
  });

  it("bloquea tras 5 intentos, aun con el código correcto", async () => {
    const { email, secret, step } = await enrolledAdmin();
    const other = await http.login(email, password);

    for (let attempt = 0; attempt < 5; attempt += 1)
      expect((await verify(other, "000000")).status).toBe(400);

    expect((await verify(other, totpCode(secret, step + 1))).status).toBe(429);
    const actions = (
      await http.db.platformAuditLog.findMany({
        where: {
          action: { in: ["PLATFORM_TOTP_FAILED", "PLATFORM_TOTP_LOCKED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      })
    ).map((row) => row.action);
    expect(actions).toEqual(["PLATFORM_TOTP_LOCKED"]);
  });

  it("el acceso vence por inactividad y por el máximo absoluto", async () => {
    const { token, email, plataforma } = await enrolledAdmin();
    expect((await panel("/platform/audit", token, plataforma)).status).toBe(
      200,
    );
    await http.db.platformToken.updateMany({
      where: { user: { email } },
      data: { lastUsedAt: new Date(Date.now() - 31 * 60_000) },
    });
    expect((await panel("/platform/audit", token, plataforma)).status).toBe(
      403,
    );

    const otro = await enrolledAdminOn(email, token);
    await http.db.platformToken.updateMany({
      where: { user: { email }, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await panel("/platform/audit", token, otro)).status).toBe(403);
  });

  /** Otra verificación del mismo administrador (código del paso siguiente). */
  async function enrolledAdminOn(email: string, token: string) {
    const admin = await http.db.platformAdmin.findFirstOrThrow({
      where: { user: { email } },
    });
    const secret = secretos.get(email)!;
    const response = await verify(
      token,
      totpCode(secret, (admin.totpLastStep ?? totpStep(new Date())) + 1),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { token: string }).token;
  }

  it("revocar corta el acceso al instante", async () => {
    const { email, token, plataforma } = await enrolledAdmin();
    expect((await panel("/platform/audit", token, plataforma)).status).toBe(
      200,
    );

    await revokePlatformAdmin(http.db, email);

    expect((await panel("/platform/audit", token, plataforma)).status).toBe(
      404,
    );
    await expect(listPlatformAdmins(http.db)).resolves.toContainEqual(
      expect.objectContaining({
        active: false,
        user: { email },
      }),
    );
  });

  it("resetear el código obliga a configurarlo de nuevo", async () => {
    const { email, token, plataforma } = await enrolledAdmin();

    await resetPlatformCode(http.db, email);

    expect(
      await (await panel("/platform/session", token, plataforma)).json(),
    ).toEqual({ enrolled: false, verified: false });
    await enroll(token);
  });

  describe("acceso atado a la pestaña (SISTEMA-94)", () => {
    it("otra pestaña con la misma cookie no puede usar el panel sin el código", async () => {
      const { email, token, plataforma } = await enrolledAdmin();
      // Pestaña 1: ingresó el código y tiene su token en memoria.
      expect((await panel("/platform/audit", token, plataforma)).status).toBe(
        200,
      );
      // Pestaña 2: misma cookie y misma sesión, sin el token.
      expect((await panel("/platform/audit", token)).status).toBe(403);
      expect(await (await panel("/platform/session", token)).json()).toEqual({
        enrolled: true,
        verified: false,
      });
      // Ni con un token inventado ni con el de otra sesión del mismo usuario.
      expect(
        (await panel("/platform/audit", token, `${randomUUID()}.inventado`))
          .status,
      ).toBe(403);
      const otraSesion = await http.login(email, password);
      expect(
        (await panel("/platform/audit", otraSesion, plataforma)).status,
      ).toBe(403);
    });

    it("el token de otro administrador no sirve", async () => {
      const uno = await enrolledAdmin();
      const otro = await enrolledAdmin();
      expect(
        (await panel("/platform/audit", otro.token, uno.plataforma)).status,
      ).toBe(403);
    });

    it("entrar como un usuario exige el token de plataforma", async () => {
      const { token, plataforma } = await enrolledAdmin();
      const ruta = `/platform/organizations/${randomUUID()}/users/${randomUUID()}/soporte`;
      expect((await panel(ruta, token, undefined, {})).status).toBe(403);
      // Con el token pasa la guardia (la farmacia no existe: 404 del servicio).
      expect((await panel(ruta, token, plataforma, {})).status).toBe(404);
    });

    it("Salir del panel revoca el token y lo audita sin guardarlo", async () => {
      const { token, plataforma } = await enrolledAdmin();
      const salir = await panel("/platform/token/salir", token, plataforma, {});
      expect(salir.status).toBe(204);
      expect((await panel("/platform/audit", token, plataforma)).status).toBe(
        403,
      );
      const filas = await http.db.platformAuditLog.findMany({
        where: {
          action: { in: ["PLATFORM_TOKEN_ISSUED", "PLATFORM_TOKEN_REVOKED"] },
        },
      });
      expect(filas.map(({ action }) => action)).toEqual(
        expect.arrayContaining([
          "PLATFORM_TOKEN_ISSUED",
          "PLATFORM_TOKEN_REVOKED",
        ]),
      );
      expect(JSON.stringify(filas)).not.toContain(plataforma.split(".")[1]!);
    });

    it("lista las sesiones del panel y cierra las demás", async () => {
      const { email, token, plataforma } = await enrolledAdmin();
      const segunda = await enrolledAdminOn(email, token);
      const lista = (await (
        await panel("/platform/tokens", token, plataforma)
      ).json()) as { id: string; actual: boolean }[];
      expect(lista).toHaveLength(2);
      expect(lista.filter(({ actual }) => actual)).toHaveLength(1);
      const cerrar = await panel(
        "/platform/tokens/close-others",
        token,
        plataforma,
        {},
      );
      expect(await cerrar.json()).toEqual({ cerradas: 1 });
      expect((await panel("/platform/audit", token, segunda)).status).toBe(403);
      expect((await panel("/platform/audit", token, plataforma)).status).toBe(
        200,
      );
    });

    it("cambiar la contraseña revoca los tokens de plataforma", async () => {
      const { token, plataforma } = await enrolledAdmin();
      const cambio = await http.request("/auth/change-password", token, {
        currentPassword: password,
        newPassword: "otra-clave-de-plataforma-99",
      });
      expect(cambio.status).toBe(200);
      expect((await panel("/platform/audit", token, plataforma)).status).toBe(
        403,
      );
    });

    it("la cookie del superadmin no es persistente y la sesión vence a las 12 h", async () => {
      const email = `${randomUUID()}@example.invalid`;
      await createPlatformAdmin(http.db, email, await hash(password));
      const login = await http.request("/auth/login", undefined, {
        email,
        password,
      });
      const cookie = login.headers.get("set-cookie")!;
      expect(cookie).not.toMatch(/Max-Age|Expires/i);
      const sesion = await http.db.authSession.findFirstOrThrow({
        where: { user: { email } },
      });
      const horas =
        (sesion.expiresAt!.getTime() - sesion.createdAt.getTime()) / 3_600_000;
      expect(horas).toBeCloseTo(12, 1);
      const renovada = await http.request(
        "/auth/refresh",
        undefined,
        {},
        "POST",
        { Cookie: cookie.split(";")[0]! },
      );
      expect(renovada.status).toBe(200);
      expect(renovada.headers.get("set-cookie")).not.toMatch(/Max-Age/i);

      // Un usuario de farmacia sigue igual: cookie persistente.
      const { email: deFarmacia } = await pharmacyUser();
      const suya = await http.request("/auth/login", undefined, {
        email: deFarmacia,
        password,
      });
      expect(suya.headers.get("set-cookie")).toMatch(/Max-Age=/);
    });
  });

  it("rechaza dar acceso a un correo de una farmacia", async () => {
    const { email } = await pharmacyUser();

    await expect(
      createPlatformAdmin(http.db, email, await hash(password)),
    ).rejects.toBeInstanceOf(PlatformCommandError);
    await expect(
      http.db.platformAdmin.count({ where: { user: { email } } }),
    ).resolves.toBe(0);
  });

  it("queda en la auditoría propia", async () => {
    const { email, token, plataforma } = await enrolledAdmin();

    const response = await panel("/platform/audit", token, plataforma);

    const rows = (await response.json()) as {
      action: string;
      actorEmail: string | null;
      after: { email?: string } | null;
    }[];
    expect(rows).toContainEqual(
      expect.objectContaining({
        action: "PLATFORM_TOTP_ENROLLED",
        actorEmail: email,
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        action: "PLATFORM_ADMIN_GRANTED",
        actorEmail: null,
        after: { email },
      }),
    );
    expect(JSON.stringify(rows)).not.toContain(password);
  });
});
