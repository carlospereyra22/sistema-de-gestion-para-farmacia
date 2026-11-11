import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { createPlatformAdmin } from "../src/platform/platform-admin.commands";
import { totpCode, totpStep } from "../src/platform/totp";
import { startHttpApp, type HttpApp } from "./support/http-app";

type Created = {
  id: string;
  email: string;
  temporaryPassword: string;
};

describe("soporte: entrar como un usuario de una farmacia (esquema aislado)", () => {
  const password = "clave-de-plataforma-1234";
  let http: HttpApp;
  let admin: string;

  beforeAll(async () => {
    process.env.FISCAL_VAULT_KEY = "ab".repeat(32);
    http = await startHttpApp("platform_soporte");
    const email = `${randomUUID()}@example.invalid`;
    await createPlatformAdmin(http.db, email, await hash(password));
    admin = await http.login(email, password);
    const enrollment = await http.request("/platform/totp/enroll", admin, {});
    const { secret } = (await enrollment.json()) as { secret: string };
    await http.request("/platform/totp/confirm", admin, {
      code: totpCode(secret, totpStep(new Date())),
    });
  }, 100000);

  afterAll(async () => {
    await http?.close();
    delete process.env.FISCAL_VAULT_KEY;
  });

  async function farmacia() {
    const response = await http.request("/platform/organizations", admin, {
      organizationName: "Farmacia Soporte",
      branchName: "Central",
      ownerEmail: `${randomUUID()}@example.invalid`,
      trialDays: 14,
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Created;
    const owner = await http.db.user.findUniqueOrThrow({
      where: { email: body.email },
    });
    const branch = await http.db.branch.findFirstOrThrow({
      where: { organizationId: body.id },
    });
    return { ...body, ownerId: owner.id, branchId: branch.id };
  }

  async function entrar(organizationId: string, userId: string) {
    const response = await http.request(
      `/platform/organizations/${organizationId}/users/${userId}/soporte`,
      admin,
      {},
    );
    return response;
  }

  it("entra como el usuario, ve lo mismo que él aunque tenga la clave por cambiar, y queda en la auditoría de la plataforma", async () => {
    const f = await farmacia();
    const response = await entrar(f.id, f.ownerId);
    expect(response.status).toBe(201);
    const { accessToken, sessionId } = (await response.json()) as {
      accessToken: string;
      sessionId: string;
    };

    const yo = await http.request("/auth/me", accessToken);
    expect(yo.status).toBe(200);
    expect(((await yo.json()) as { email: string }).email).toBe(f.email);
    // El dueño recién creado tiene que cambiar la clave: al soporte no lo frena.
    const sucursales = await http.request(
      `/organizations/${f.id}/branches`,
      accessToken,
    );
    expect(sucursales.status).toBe(200);

    const auditoria = await http.db.platformAuditLog.findMany({
      where: { organizationId: f.id, action: "SOPORTE_ENTRO" },
    });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.after).toMatchObject({ sessionId });
    // La farmacia no ve nada: su auditoría no registra la entrada.
    expect(
      await http.db.auditLog.count({
        where: { organizationId: f.id, action: { contains: "SOPORTE" } },
      }),
    ).toBe(0);
  });

  it("como soporte no se emite en ARCA producción", async () => {
    const f = await farmacia();
    const { accessToken } = (await (await entrar(f.id, f.ownerId)).json()) as {
      accessToken: string;
    };
    const venta = await http.request(
      `/organizations/${f.id}/branches/${f.branchId}/sales`,
      accessToken,
      {
        fiscalEnvironment: "PRODUCTION",
        confirmProduction: true,
        documentType: "INVOICE",
        items: [{ productId: randomUUID(), quantity: 1 }],
        payments: [{ method: "CASH", amountMinor: 100 }],
      },
    );
    expect(venta.status).toBe(403);
    expect(((await venta.json()) as { code: string }).code).toBe(
      "SOPORTE_SIN_ARCA_PRODUCCION",
    );
    const activar = await http.request(
      `/organizations/${f.id}/fiscal-production/activate`,
      accessToken,
      {},
    );
    expect(activar.status).toBe(403);
  });

  it("volver al panel corta la sesión de soporte en el momento", async () => {
    const f = await farmacia();
    const { accessToken, sessionId } = (await (
      await entrar(f.id, f.ownerId)
    ).json()) as { accessToken: string; sessionId: string };

    const salir = await http.request(
      `/platform/soporte/${sessionId}/salir`,
      admin,
      {},
    );
    expect(salir.status).toBe(204);
    expect((await http.request("/auth/me", accessToken)).status).toBe(401);
    expect(
      await http.db.platformAuditLog.count({
        where: { organizationId: f.id, action: "SOPORTE_SALIO" },
      }),
    ).toBe(1);
  });

  it("no existe para un usuario de farmacia, ni para un usuario de otra farmacia", async () => {
    const f = await farmacia();
    const otra = await farmacia();
    const dueno = await http.login(f.email, f.temporaryPassword);

    expect(
      (
        await http.request(
          `/platform/organizations/${f.id}/users/${f.ownerId}/soporte`,
          dueno,
          {},
        )
      ).status,
    ).toBe(404);
    expect((await entrar(f.id, otra.ownerId)).status).toBe(404);
  });
});
