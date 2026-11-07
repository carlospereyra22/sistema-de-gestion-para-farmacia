import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash } from "@node-rs/argon2";
import { createPlatformAdmin } from "../src/platform/platform-admin.commands";
import { totpCode, totpStep } from "../src/platform/totp";
import { startHttpApp, type HttpApp } from "./support/http-app";

type Created = {
  id: string;
  name: string;
  email: string;
  temporaryPassword: string;
};

describe("farmacias desde el panel por HTTP (esquema aislado)", () => {
  const password = "clave-de-plataforma-1234";
  let http: HttpApp;
  let admin: string;

  beforeAll(async () => {
    process.env.FISCAL_VAULT_KEY = "ab".repeat(32);
    http = await startHttpApp("platform_organizations");
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

  const newOrganization = (extra: object = {}) => ({
    organizationName: "Farmacia Nueva",
    branchName: "Central",
    ownerEmail: `${randomUUID()}@example.invalid`,
    trialDays: 14,
    ...extra,
  });

  async function created(extra: object = {}) {
    const response = await http.request(
      "/platform/organizations",
      admin,
      newOrganization(extra),
    );
    expect(response.status).toBe(201);
    return (await response.json()) as Created;
  }

  /** Con lugar de sobra: estos tests no son sobre el cupo. */
  async function createdWithRoom() {
    const body = await created();
    await http.db.organizationSubscription.update({
      where: { organizationId: body.id },
      data: { extraUsers: 5, extraBranches: 5 },
    });
    return body;
  }

  describe("acceso", () => {
    it.each(["/platform/organizations", "/platform/plans"])(
      "%s no existe para un usuario de farmacia ni sin sesión",
      async (path) => {
        const { email, temporaryPassword } = await created();
        const token = await http.login(email, temporaryPassword);

        expect((await http.request(path, token)).status).toBe(404);
        expect((await http.request(path)).status).toBe(404);
      },
    );

    it("exige haber pasado el código", async () => {
      const email = `${randomUUID()}@example.invalid`;
      await createPlatformAdmin(http.db, email, await hash(password));
      const token = await http.login(email, password);

      const response = await http.request("/platform/organizations", token);

      expect(response.status).toBe(403);
    });
  });

  describe("alta de una farmacia", () => {
    it("crea todo y el dueño entra con la clave temporal", async () => {
      const body = await created();

      const owner = await http.db.user.findUniqueOrThrow({
        where: { email: body.email },
      });
      expect(owner.mustChangePassword).toBe(true);
      await expect(
        http.db.role.count({ where: { organizationId: body.id } }),
      ).resolves.toBe(4);

      const token = await http.login(body.email, body.temporaryPassword);
      const me = await http.request("/auth/me", token);
      expect(await me.json()).toMatchObject({ mustChangePassword: true });
    });

    it("arranca en prueba con el contacto cargado", async () => {
      const { id } = await created({
        contactName: "Ana",
        contactPhone: "351-000",
      });

      const response = await http.request(
        `/platform/organizations/${id}`,
        admin,
      );

      expect(await response.json()).toMatchObject({
        subscription: {
          stage: "TRIAL",
          access: "FULL",
          contactName: "Ana",
          contactPhone: "351-000",
        },
      });
    });

    it("no guarda la clave temporal en ninguna auditoría", async () => {
      const { id, temporaryPassword } = await created();

      const [platform, organization] = await Promise.all([
        http.db.platformAuditLog.findMany({ where: { organizationId: id } }),
        http.db.auditLog.findMany({ where: { organizationId: id } }),
      ]);

      expect(platform.map((row) => row.action)).toEqual([
        "PLATFORM_ORGANIZATION_CREATED",
      ]);
      expect(JSON.stringify([platform, organization])).not.toContain(
        temporaryPassword,
      );
    });

    it("rechaza un correo que ya tiene cuenta, sin crear nada", async () => {
      const { email } = await created();
      const name = `Duplicada ${randomUUID()}`;

      const response = await http.request(
        "/platform/organizations",
        admin,
        newOrganization({ ownerEmail: email, organizationName: name }),
      );

      expect(response.status).toBe(409);
      await expect(
        http.db.organization.count({ where: { name } }),
      ).resolves.toBe(0);
    });

    it("si falla el último paso no queda nada a medias", async () => {
      const name = `Interrumpida ${randomUUID()}`;
      const ownerEmail = `${randomUUID()}@example.invalid`;
      await http.db.$executeRawUnsafe(`
        CREATE FUNCTION fallar_alta() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'falla simulada'; END;
        $$ LANGUAGE plpgsql`);
      await http.db.$executeRawUnsafe(`
        CREATE TRIGGER fallar_alta BEFORE INSERT ON "PlatformAuditLog"
        FOR EACH ROW EXECUTE FUNCTION fallar_alta()`);
      try {
        const response = await http.request(
          "/platform/organizations",
          admin,
          newOrganization({ organizationName: name, ownerEmail }),
        );

        expect(response.status).toBe(500);
      } finally {
        await http.db.$executeRawUnsafe(
          'DROP TRIGGER fallar_alta ON "PlatformAuditLog"',
        );
        await http.db.$executeRawUnsafe("DROP FUNCTION fallar_alta()");
      }
      await expect(
        http.db.organization.count({ where: { name } }),
      ).resolves.toBe(0);
      await expect(
        http.db.user.count({ where: { email: ownerEmail } }),
      ).resolves.toBe(0);
    });
  });

  describe("usuarios de una farmacia", () => {
    it("agrega un empleado con acceso a las sucursales y clave temporal", async () => {
      const { id } = await createdWithRoom();
      const email = `${randomUUID()}@example.invalid`;

      const response = await http.request(
        `/platform/organizations/${id}/users`,
        admin,
        { email, roleCode: "EMPLEADO", displayName: "Lucía" },
      );

      expect(response.status).toBe(201);
      const body = (await response.json()) as { temporaryPassword: string };
      const token = await http.login(email, body.temporaryPassword);
      expect(
        await (await http.request("/auth/me", token)).json(),
      ).toMatchObject({ mustChangePassword: true });
      const user = await http.db.user.findUniqueOrThrow({
        where: { email },
        include: { branches: true },
      });
      expect(user.branches).toHaveLength(1);
    });

    it("rechaza un rol que no existe en esa farmacia", async () => {
      const { id } = await createdWithRoom();

      const response = await http.request(
        `/platform/organizations/${id}/users`,
        admin,
        { email: `${randomUUID()}@example.invalid`, roleCode: "INVENTADO" },
      );

      expect(response.status).toBe(404);
    });

    it("resetear la clave invalida la anterior y las sesiones", async () => {
      const { id, email, temporaryPassword } = await created();
      const session = await http.login(email, temporaryPassword);
      const user = await http.db.user.findUniqueOrThrow({ where: { email } });

      const response = await http.request(
        `/platform/organizations/${id}/users/${user.id}/reset-password`,
        admin,
        {},
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { temporaryPassword: string };
      expect(body.temporaryPassword).not.toBe(temporaryPassword);
      expect((await http.request("/auth/me", session)).status).toBe(401);
      await http.login(email, body.temporaryPassword);
    });

    it("no resetea a alguien de otra farmacia", async () => {
      const first = await created();
      const second = await created();
      const user = await http.db.user.findUniqueOrThrow({
        where: { email: second.email },
      });

      const response = await http.request(
        `/platform/organizations/${first.id}/users/${user.id}/reset-password`,
        admin,
        {},
      );

      expect(response.status).toBe(404);
    });
  });

  describe("sucursales de una farmacia", () => {
    const addBranch = (id: string, name: string) =>
      http.request(`/platform/organizations/${id}/branches`, admin, { name });

    it("la asigna a los dueños, que si no no podrían operarla", async () => {
      const { id, email, temporaryPassword } = await createdWithRoom();
      const employee = `${randomUUID()}@example.invalid`;
      await http.request(`/platform/organizations/${id}/users`, admin, {
        email: employee,
        roleCode: "EMPLEADO",
      });

      const response = await addBranch(id, "Sucursal Norte");

      expect(response.status).toBe(201);
      const branch = (await response.json()) as { id: string };
      const assigned = await http.db.userBranch.findMany({
        where: { branchId: branch.id },
        select: { user: { select: { email: true } } },
      });
      expect(assigned.map(({ user }) => user.email)).toEqual([email]);
      await expect(
        http.db.platformAuditLog.count({
          where: { action: "PLATFORM_BRANCH_CREATED", organizationId: id },
        }),
      ).resolves.toBe(1);

      const token = await http.login(email, temporaryPassword);
      await http.request("/auth/change-password", token, {
        currentPassword: temporaryPassword,
        newPassword: "clave-elegida-por-el-dueno",
      });
      const list = await http.request(`/organizations/${id}/branches`, token);
      expect(await list.json()).toContainEqual(
        expect.objectContaining({ name: "Sucursal Norte", canAccess: true }),
      );
    });

    it("genera el código solo, aunque el nombre se repita", async () => {
      const { id } = await createdWithRoom();

      const first = await addBranch(id, "Sucursal Norte");
      const second = await addBranch(id, "Sucursal Norte");

      expect(await first.json()).toMatchObject({ code: "SUCURSAL-NORTE" });
      expect(await second.json()).toMatchObject({ code: "SUCURSAL-NORTE-2" });
    });

    it("el mismo nombre sirve en otra farmacia", async () => {
      const first = await createdWithRoom();
      const second = await createdWithRoom();
      await addBranch(first.id, "Norte");

      const response = await addBranch(second.id, "Norte");

      expect(await response.json()).toMatchObject({ code: "NORTE" });
    });

    it("no reutiliza el código de una sucursal eliminada", async () => {
      const { id } = await createdWithRoom();
      const first = (await (await addBranch(id, "Norte")).json()) as {
        id: string;
      };
      await http.db.branch.update({
        where: { id: first.id },
        data: { deletedAt: new Date(), active: false },
      });

      const response = await addBranch(id, "Norte");

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ code: "NORTE-2" });
    });

    it("una farmacia inexistente da 404", async () => {
      expect((await addBranch(randomUUID(), "Norte")).status).toBe(404);
    });

    it("exige un nombre", async () => {
      const { id } = await created();

      expect((await addBranch(id, "N")).status).toBe(400);
    });
  });

  describe("ficha", () => {
    it("muestra datos comerciales, nunca operación ni claves", async () => {
      const { id, email } = await created();

      const response = await http.request(
        `/platform/organizations/${id}`,
        admin,
      );

      const text = await response.text();
      const body = JSON.parse(text) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        "billing",
        "branches",
        "createdAt",
        "id",
        "name",
        "roles",
        "subscription",
        "users",
      ]);
      expect(text).toContain(email);
      expect(text).not.toContain("passwordHash");
    });

    it("una farmacia inexistente da 404", async () => {
      const response = await http.request(
        `/platform/organizations/${randomUUID()}`,
        admin,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("precios", () => {
    const plan = async () => {
      const response = await http.request("/platform/plans", admin);
      const [first] = (await response.json()) as { id: string }[];
      return first!;
    };

    const setPrices = async () =>
      http.request(
        `/platform/plans/${(await plan()).id}`,
        admin,
        {
          baseMinor: "5500000",
          extraUserMinor: "1000000",
          extraBranchMinor: "3500000",
        },
        "PATCH",
      );

    it("el plan nace sin importes", async () => {
      const seeded = await http.db.subscriptionPlan.findUniqueOrThrow({
        where: { code: "ESTANDAR" },
      });
      // Otros tests ya pudieron cargar precios: importa el valor por defecto de la columna.
      const [column] = await http.db.$queryRawUnsafe<
        { column_default: string }[]
      >(
        `SELECT column_default FROM information_schema.columns
         WHERE table_name = 'SubscriptionPlan' AND column_name = 'baseMinor'
         AND table_schema = current_schema()`,
      );
      expect(seeded.code).toBe("ESTANDAR");
      expect(column?.column_default).toBe("0");
    });

    it("cargar precios se refleja en el abono y queda auditado", async () => {
      expect((await setPrices()).status).toBe(200);
      const { id } = await created();

      const update = await http.request(
        `/platform/organizations/${id}/subscription`,
        admin,
        { extraUsers: 1, extraBranches: 1, agreedPriceMinor: null },
        "PATCH",
      );

      expect(await update.json()).toMatchObject({
        feeMinor: "10000000",
        quota: { users: 2, branches: 2 },
      });
      await expect(
        http.db.platformAuditLog.count({
          where: { action: "PLATFORM_PLAN_UPDATED" },
        }),
      ).resolves.toBeGreaterThan(0);
    });

    it("un precio acordado reemplaza a la fórmula", async () => {
      await setPrices();
      const { id } = await created();

      const update = await http.request(
        `/platform/organizations/${id}/subscription`,
        admin,
        { extraUsers: 3, extraBranches: 0, agreedPriceMinor: "4000000" },
        "PATCH",
      );

      expect(await update.json()).toMatchObject({ feeMinor: "4000000" });
    });

    it("rechaza importes con decimales o negativos", async () => {
      const response = await http.request(
        `/platform/plans/${(await plan()).id}`,
        admin,
        { baseMinor: "-1", extraUserMinor: "1.5", extraBranchMinor: "0" },
        "PATCH",
      );

      expect(response.status).toBe(400);
    });
  });

  describe("la migración", () => {
    it("deja exentas a las farmacias que ya existían", async () => {
      const organization = await http.db.organization.create({
        data: { name: "Farmacia existente" },
      });
      const sql = readFileSync(
        join(
          __dirname,
          "../prisma/migrations/20261107000000_subscription_model/migration.sql",
        ),
        "utf8",
      );
      const statement = sql.slice(
        sql.indexOf('INSERT INTO "OrganizationSubscription"'),
      );

      await http.db.$executeRawUnsafe(
        statement
          .trim()
          .replace(/;$/, "")
          .concat(" AND organization.name = 'Farmacia existente'"),
      );

      const list = await http.request("/platform/organizations", admin);
      const rows = (await list.json()) as {
        id: string;
        subscription: { stage: string; access: string; feeMinor: string };
      }[];
      expect(
        rows.find((row) => row.id === organization.id)?.subscription,
      ).toMatchObject({ stage: "EXEMPT", access: "FULL", feeMinor: "0" });
    });
  });
});
