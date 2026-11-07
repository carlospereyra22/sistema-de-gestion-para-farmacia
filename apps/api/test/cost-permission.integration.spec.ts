import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash } from "@node-rs/argon2";
import { employeePermissions } from "../src/organizations/organization-provisioning";
import { createPlatformAdmin } from "../src/platform/platform-admin.commands";
import { totpCode, totpStep } from "../src/platform/totp";
import { startHttpApp, type HttpApp } from "./support/http-app";

type Lot = { id: string; quantity: number; unitCostMinor?: string };

describe("permiso para ver costos por HTTP (esquema aislado)", () => {
  const password = "clave-de-plataforma-1234";
  let http: HttpApp;
  let admin: string;

  beforeAll(async () => {
    process.env.FISCAL_VAULT_KEY = "ab".repeat(32);
    http = await startHttpApp("cost_permission");
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

  /** Farmacia con dueño, empleado y un lote que costó $2,00 la unidad. */
  async function pharmacy() {
    const created = (await (
      await http.request("/platform/organizations", admin, {
        organizationName: "Farmacia",
        branchName: "Central",
        ownerEmail: `${randomUUID()}@example.invalid`,
        trialDays: 14,
      })
    ).json()) as { id: string; email: string; temporaryPassword: string };
    const { id } = created;
    await http.db.organizationSubscription.update({
      where: { organizationId: id },
      data: { extraUsers: 1 },
    });
    const employee = (await (
      await http.request(`/platform/organizations/${id}/users`, admin, {
        email: `${randomUUID()}@example.invalid`,
        roleCode: "EMPLEADO",
      })
    ).json()) as { email: string; temporaryPassword: string };
    await http.db.user.updateMany({
      where: { email: { in: [created.email, employee.email] } },
      data: { mustChangePassword: false },
    });
    const branch = await http.db.branch.findFirstOrThrow({
      where: { organizationId: id },
    });
    const product = await http.db.product.create({
      data: { organizationId: id, name: "Ibuprofeno 400" },
    });
    await http.db.productLot.create({
      data: {
        organizationId: id,
        branchId: branch.id,
        productId: product.id,
        number: "L1",
        quantity: 5,
        unitCostMinor: 200n,
      },
    });
    return {
      id,
      inventory: `/organizations/${id}/branches/${branch.id}/inventory`,
      owner: await http.login(created.email, created.temporaryPassword),
      employee: await http.login(employee.email, employee.temporaryPassword),
    };
  }

  const stock = async (path: string, token: string) =>
    (await (await http.request(`${path}/stock`, token)).json()) as Lot[];

  it("el dueño ve el costo de cada lote", async () => {
    const { inventory, owner } = await pharmacy();

    const [lot] = await stock(inventory, owner);

    expect(lot).toMatchObject({ quantity: 5, unitCostMinor: "200" });
  });

  it("el empleado ve el stock, pero no el costo", async () => {
    const { inventory, employee } = await pharmacy();

    const [lot] = await stock(inventory, employee);

    expect(lot?.quantity).toBe(5);
    expect(lot).not.toHaveProperty("unitCostMinor");
  });

  it("el empleado no puede pedir los costos aparte", async () => {
    const { inventory, owner, employee } = await pharmacy();

    const denied = await http.request(`${inventory}/costs`, employee);

    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { message: string }).message).toContain(
      "No tenés permiso",
    );
    expect((await http.request(`${inventory}/costs`, owner)).status).toBe(200);
  });

  it("si el dueño se lo habilita al rol, lo ve al instante", async () => {
    const { id, inventory, owner, employee } = await pharmacy();
    const role = await http.db.role.findFirstOrThrow({
      where: { organizationId: id, code: "EMPLEADO" },
    });

    const response = await http.request(
      `/organizations/${id}/roles/${role.id}/permissions`,
      owner,
      { permissionCodes: [...employeePermissions, "COST_READ"] },
      "PATCH",
    );

    expect(response.status).toBe(200);
    const [lot] = await stock(inventory, employee);
    expect(lot?.unitCostMinor).toBe("200");
  });

  it("la migración se lo da a quien hoy ve el stock, menos al mostrador", async () => {
    const { id } = await pharmacy();
    const roles = await http.db.role.findMany({
      where: { organizationId: id, code: { in: ["OWNER", "EMPLEADO"] } },
    });
    const costRead = await http.db.permission.findUniqueOrThrow({
      where: { code: "COST_READ" },
    });
    await http.db.rolePermission.deleteMany({
      where: {
        permissionId: costRead.id,
        roleId: { in: roles.map((role) => role.id) },
      },
    });
    const sql = readFileSync(
      join(
        __dirname,
        "../prisma/migrations/20261107020000_cost_read_permission/migration.sql",
      ),
      "utf8",
    );

    // Dos veces: volver a correrla no duplica ni falla.
    for (let run = 0; run < 2; run += 1)
      for (const statement of sql
        .split(";")
        .map((part) =>
          part
            .split("\n")
            .filter((line) => !line.trim().startsWith("--"))
            .join("\n")
            .trim(),
        )
        .filter(Boolean))
        await http.db.$executeRawUnsafe(statement);

    const granted = await http.db.rolePermission.findMany({
      where: {
        permissionId: costRead.id,
        roleId: { in: roles.map((role) => role.id) },
      },
      select: { role: { select: { code: true } } },
    });
    expect(granted.map(({ role }) => role.code)).toEqual(["OWNER"]);
  });

  it("una farmacia nueva crea el Empleado sin costos", async () => {
    expect(employeePermissions).not.toContain("COST_READ");
  });
});
