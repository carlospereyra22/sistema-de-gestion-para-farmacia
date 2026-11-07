import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { createPlatformAdmin } from "../src/platform/platform-admin.commands";
import { totpCode, totpStep } from "../src/platform/totp";
import { startHttpApp, type HttpApp } from "./support/http-app";

describe("cupos del plan por HTTP (esquema aislado)", () => {
  const password = "clave-de-plataforma-1234";
  let http: HttpApp;
  let admin: string;

  beforeAll(async () => {
    process.env.FISCAL_VAULT_KEY = "ab".repeat(32);
    http = await startHttpApp("platform_quota");
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

  /** Farmacia nueva con el plan base: 1 usuario y 1 sucursal, y su dueño ya adentro. */
  async function pharmacy() {
    const response = await http.request("/platform/organizations", admin, {
      organizationName: "Farmacia",
      branchName: "Central",
      ownerEmail: `${randomUUID()}@example.invalid`,
      trialDays: 14,
    });
    const body = (await response.json()) as {
      id: string;
      email: string;
      temporaryPassword: string;
    };
    await http.db.user.update({
      where: { email: body.email },
      data: { mustChangePassword: false },
    });
    const [owner, branch, role] = await Promise.all([
      http.login(body.email, body.temporaryPassword),
      http.db.branch.findFirstOrThrow({ where: { organizationId: body.id } }),
      http.db.role.findFirstOrThrow({
        where: { organizationId: body.id, code: "EMPLEADO" },
      }),
    ]);
    return { id: body.id, owner, branchId: branch.id, roleId: role.id };
  }

  type Pharmacy = Awaited<ReturnType<typeof pharmacy>>;

  const setPlan = (id: string, extraUsers: number, extraBranches: number) =>
    http.request(
      `/platform/organizations/${id}/subscription`,
      admin,
      { extraUsers, extraBranches, agreedPriceMinor: null },
      "PATCH",
    );

  const addUserFromPharmacy = ({ id, owner, branchId, roleId }: Pharmacy) =>
    http.request(`/organizations/${id}/users`, owner, {
      email: `${randomUUID()}@example.invalid`,
      password: "clave-de-empleado-1234",
      branchIds: [branchId],
      roleIds: [roleId],
    });

  const addUserFromPanel = (id: string) =>
    http.request(`/platform/organizations/${id}/users`, admin, {
      email: `${randomUUID()}@example.invalid`,
      roleCode: "EMPLEADO",
    });

  const setUserActive = (
    { id, owner, branchId, roleId }: Pharmacy,
    userId: string,
    active: boolean,
  ) =>
    http.request(
      `/organizations/${id}/users/${userId}`,
      owner,
      { active, branchIds: [branchId], roleIds: [roleId] },
      "PATCH",
    );

  const addBranchFromPharmacy = ({ id, owner }: Pharmacy, name = "Norte") =>
    http.request(`/organizations/${id}/branches`, owner, { name });

  const addBranchFromPanel = (id: string, name = "Norte") =>
    http.request(`/platform/organizations/${id}/branches`, admin, { name });

  const setBranchActive = (
    { id, owner }: Pharmacy,
    branchId: string,
    active: boolean,
  ) =>
    http.request(
      `/organizations/${id}/branches/${branchId}/status`,
      owner,
      { active },
      "PATCH",
    );

  const activeUsers = (organizationId: string) =>
    http.db.userOrganization.count({ where: { organizationId, active: true } });

  const activeBranches = (organizationId: string) =>
    http.db.branch.count({
      where: { organizationId, active: true, deletedAt: null },
    });

  const message = async (response: Response) =>
    ((await response.json()) as { message: string }).message;

  const idOf = async (response: Response) =>
    ((await response.json()) as { id: string }).id;

  describe("usuarios", () => {
    it("la farmacia no puede pasarse de su cupo", async () => {
      const farmacia = await pharmacy();

      const response = await addUserFromPharmacy(farmacia);

      expect(response.status).toBe(409);
      expect(await message(response)).toContain("límite de 1 usuario de");
      await expect(activeUsers(farmacia.id)).resolves.toBe(1);
    });

    it("el panel tampoco", async () => {
      const { id } = await pharmacy();

      expect((await addUserFromPanel(id)).status).toBe(409);
      await expect(activeUsers(id)).resolves.toBe(1);
    });

    it("ampliar el plan habilita justo lo contratado", async () => {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 1, 0);

      expect((await addUserFromPharmacy(farmacia)).status).toBe(201);

      const response = await addUserFromPharmacy(farmacia);
      expect(response.status).toBe(409);
      expect(await message(response)).toContain("límite de 2 usuarios");
    });

    it("un usuario dado de baja libera su lugar", async () => {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 1, 0);
      const userId = await idOf(await addUserFromPharmacy(farmacia));

      await setUserActive(farmacia, userId, false);

      expect((await addUserFromPharmacy(farmacia)).status).toBe(201);
    });

    it("no se reactiva a alguien por encima del cupo", async () => {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 1, 0);
      const userId = await idOf(await addUserFromPharmacy(farmacia));
      await setUserActive(farmacia, userId, false);
      await addUserFromPharmacy(farmacia);

      const response = await setUserActive(farmacia, userId, true);

      expect(response.status).toBe(409);
      await expect(activeUsers(farmacia.id)).resolves.toBe(2);
    });

    it("editar a un usuario activo no se frena aunque el cupo esté lleno", async () => {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 1, 0);
      const userId = await idOf(await addUserFromPharmacy(farmacia));
      await setPlan(farmacia.id, 0, 0);

      expect((await setUserActive(farmacia, userId, true)).status).toBe(200);
    });

    it("dos altas al mismo tiempo no superan el cupo", async () => {
      const { id } = await pharmacy();
      await setPlan(id, 1, 0);

      const results = await Promise.all([
        addUserFromPanel(id),
        addUserFromPanel(id),
      ]);

      expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
      await expect(activeUsers(id)).resolves.toBe(2);
    });

    it("bajar el cupo no desactiva a nadie, solo impide altas", async () => {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 1, 0);
      await addUserFromPharmacy(farmacia);

      expect((await setPlan(farmacia.id, 0, 0)).status).toBe(200);

      await expect(activeUsers(farmacia.id)).resolves.toBe(2);
      expect((await addUserFromPharmacy(farmacia)).status).toBe(409);
    });
  });

  describe("sucursales", () => {
    it("la farmacia no puede pasarse de su cupo", async () => {
      const farmacia = await pharmacy();

      const response = await addBranchFromPharmacy(farmacia);

      expect(response.status).toBe(409);
      expect(await message(response)).toContain("límite de 1 sucursal de");
      await expect(activeBranches(farmacia.id)).resolves.toBe(1);
    });

    it("el panel tampoco", async () => {
      const { id } = await pharmacy();

      expect((await addBranchFromPanel(id)).status).toBe(409);
      await expect(activeBranches(id)).resolves.toBe(1);
    });

    it("ampliar el plan habilita justo lo contratado", async () => {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 0, 1);

      expect((await addBranchFromPharmacy(farmacia)).status).toBe(201);

      const response = await addBranchFromPharmacy(farmacia, "Sur");
      expect(response.status).toBe(409);
      expect(await message(response)).toContain("límite de 2 sucursales");
    });

    it("una sucursal desactivada libera su lugar", async () => {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 0, 1);
      const branchId = await idOf(await addBranchFromPharmacy(farmacia));

      await setBranchActive(farmacia, branchId, false);

      expect((await addBranchFromPharmacy(farmacia, "Sur")).status).toBe(201);
    });

    it("no se reactiva una sucursal por encima del cupo", async () => {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 0, 1);
      const branchId = await idOf(await addBranchFromPharmacy(farmacia));
      await setBranchActive(farmacia, branchId, false);
      await addBranchFromPharmacy(farmacia, "Sur");

      const response = await setBranchActive(farmacia, branchId, true);

      expect(response.status).toBe(409);
      await expect(activeBranches(farmacia.id)).resolves.toBe(2);
    });

    it("dos altas al mismo tiempo no superan el cupo", async () => {
      const { id } = await pharmacy();
      await setPlan(id, 0, 1);

      const results = await Promise.all([
        addBranchFromPanel(id, "Norte"),
        addBranchFromPanel(id, "Sur"),
      ]);

      expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
      await expect(activeBranches(id)).resolves.toBe(2);
    });

    it("crear y reactivar al mismo tiempo no se traban ni superan el cupo", async () => {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 0, 1);
      const branchId = await idOf(await addBranchFromPharmacy(farmacia));
      await setBranchActive(farmacia, branchId, false);

      const results = await Promise.all([
        addBranchFromPharmacy(farmacia, "Sur"),
        setBranchActive(farmacia, branchId, true),
      ]);

      const statuses = results.map(({ status }) => status);
      expect(statuses.filter((status) => status === 409)).toHaveLength(1);
      expect(statuses.filter((status) => status < 300)).toHaveLength(1);
      await expect(activeBranches(farmacia.id)).resolves.toBe(2);
    });
  });

  describe("sin límite", () => {
    it("una farmacia exenta no tiene cupo", async () => {
      const farmacia = await pharmacy();
      await http.db.organizationSubscription.update({
        where: { organizationId: farmacia.id },
        data: { exempt: true },
      });

      expect((await addUserFromPharmacy(farmacia)).status).toBe(201);
      expect((await addBranchFromPharmacy(farmacia)).status).toBe(201);
    });

    it("sin suscripción tampoco: un dato faltante no frena a nadie", async () => {
      const farmacia = await pharmacy();
      await http.db.organizationSubscription.delete({
        where: { organizationId: farmacia.id },
      });

      expect((await addUserFromPharmacy(farmacia)).status).toBe(201);
      expect((await addBranchFromPharmacy(farmacia)).status).toBe(201);
    });
  });

  describe("código de sucursal", () => {
    type Branch = { id: string; code: string };

    async function roomy() {
      const farmacia = await pharmacy();
      await setPlan(farmacia.id, 0, 5);
      return farmacia;
    }

    it("la farmacia la crea sin escribir código", async () => {
      const farmacia = await roomy();

      const first = await addBranchFromPharmacy(farmacia, "Sucursal Norte");
      const second = await addBranchFromPharmacy(farmacia, "Sucursal Norte");

      expect(await first.json()).toMatchObject({ code: "SUCURSAL-NORTE" });
      expect(await second.json()).toMatchObject({ code: "SUCURSAL-NORTE-2" });
    });

    it("sigue aceptando el código que manda una web sin actualizar", async () => {
      const { id, owner } = await roomy();

      const response = await http.request(
        `/organizations/${id}/branches`,
        owner,
        { name: "Norte", code: "abc-1" },
      );

      expect(await response.json()).toMatchObject({ code: "ABC-1" });
    });

    it("rechaza un código inválido", async () => {
      const { id, owner } = await roomy();

      const response = await http.request(
        `/organizations/${id}/branches`,
        owner,
        { name: "Norte", code: "con espacios" },
      );

      expect(response.status).toBe(400);
    });

    it("editar sin código conserva el que tenía", async () => {
      const farmacia = await roomy();
      const created = (await (
        await addBranchFromPharmacy(farmacia, "Norte")
      ).json()) as Branch;

      const response = await http.request(
        `/organizations/${farmacia.id}/branches/${created.id}`,
        farmacia.owner,
        { name: "Zona Norte", address: "Calle 1" },
        "PATCH",
      );

      expect(await response.json()).toMatchObject({
        name: "Zona Norte",
        code: "NORTE",
        address: "Calle 1",
      });
    });
  });
});
