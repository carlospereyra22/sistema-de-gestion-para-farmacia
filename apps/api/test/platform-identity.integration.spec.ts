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

  /** Cuenta con el código ya configurado y la sesión verificada. */
  async function enrolledAdmin() {
    const account = await admin();
    const secret = await enroll(account.token);
    const step = totpStep(new Date());
    const response = await confirm(account.token, totpCode(secret, step));
    expect(response.status).toBe(200);
    return { ...account, secret, step };
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
    const { email, token, secret } = await enrolledAdmin();

    expect((await http.request("/platform/audit", token)).status).toBe(200);
    expect(
      await (await http.request("/platform/session", token)).json(),
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
    expect((await verify(other, totpCode(secret, step + 1))).status).toBe(200);
    expect((await http.request("/platform/audit", other)).status).toBe(200);
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

  it("la verificación vence a las 12 horas", async () => {
    const { token, email } = await enrolledAdmin();
    await http.db.authSession.updateMany({
      where: { user: { email } },
      data: { platformVerifiedAt: new Date(Date.now() - 13 * 60 * 60 * 1000) },
    });

    expect((await http.request("/platform/audit", token)).status).toBe(403);
  });

  it("revocar corta el acceso al instante", async () => {
    const { email, token } = await enrolledAdmin();
    expect((await http.request("/platform/audit", token)).status).toBe(200);

    await revokePlatformAdmin(http.db, email);

    expect((await http.request("/platform/audit", token)).status).toBe(404);
    await expect(listPlatformAdmins(http.db)).resolves.toContainEqual(
      expect.objectContaining({
        active: false,
        user: { email },
      }),
    );
  });

  it("resetear el código obliga a configurarlo de nuevo", async () => {
    const { email, token } = await enrolledAdmin();

    await resetPlatformCode(http.db, email);

    expect(
      await (await http.request("/platform/session", token)).json(),
    ).toEqual({ enrolled: false, verified: false });
    await enroll(token);
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
    const { email, token } = await enrolledAdmin();

    const response = await http.request("/platform/audit", token);

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
