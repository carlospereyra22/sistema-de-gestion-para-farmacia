import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { createPlatformAdmin } from "../src/platform/platform-admin.commands";
import { commercialToday } from "../src/platform/subscription-access";
import { addDays } from "../src/platform/subscription-ledger";
import { totpCode, totpStep } from "../src/platform/totp";
import { startHttpApp, type HttpApp } from "./support/http-app";

type Status = {
  stage: string;
  access: string;
  daysLeft: number | null;
  nextCut: { access: string; on: string; inDays: number } | null;
  isOwner: boolean;
  balanceMinor: string | null;
};

describe("corte por falta de pago por HTTP (esquema aislado)", () => {
  const password = "clave-de-plataforma-1234";
  const today = commercialToday(new Date());
  let http: HttpApp;
  let admin: string;

  beforeAll(async () => {
    process.env.FISCAL_VAULT_KEY = "ab".repeat(32);
    http = await startHttpApp("platform_cut");
    const email = `${randomUUID()}@example.invalid`;
    await createPlatformAdmin(http.db, email, await hash(password));
    admin = await http.login(email, password);
    const enrollment = await http.request("/platform/totp/enroll", admin, {});
    const { secret } = (await enrollment.json()) as { secret: string };
    await http.request("/platform/totp/confirm", admin, {
      code: totpCode(secret, totpStep(new Date())),
    });
    await http.db.subscriptionPlan.updateMany({ data: { baseMinor: 10000n } });
  }, 100000);

  afterAll(async () => {
    await http?.close();
    delete process.env.FISCAL_VAULT_KEY;
  });

  /** Farmacia con su dueño y un empleado, ya adentro, y la prueba vencida hace `days`. */
  async function pharmacy(days: number) {
    const created = (await (
      await http.request("/platform/organizations", admin, {
        organizationName: "Farmacia",
        branchName: "Central",
        ownerEmail: `${randomUUID()}@example.invalid`,
        trialDays: 14,
      })
    ).json()) as { id: string; email: string; temporaryPassword: string };
    const { id } = created;
    await http.request(
      `/platform/organizations/${id}/subscription`,
      admin,
      { extraUsers: 1, extraBranches: 0, agreedPriceMinor: null },
      "PATCH",
    );
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
    await overdue(id, days);
    const branch = await http.db.branch.findFirstOrThrow({
      where: { organizationId: id },
    });
    return {
      id,
      branchId: branch.id,
      owner: await http.login(created.email, created.temporaryPassword),
      employee: await http.login(employee.email, employee.temporaryPassword),
    };
  }

  const overdue = (organizationId: string, days: number) =>
    http.db.organizationSubscription.update({
      where: { organizationId },
      data: {
        trialEndsAt: new Date(`${addDays(today, -days)}T00:00:00.000Z`),
      },
    });

  /** Escritura común: con datos inválidos da 400 si pasa el corte, 402 si no. */
  const write = (id: string, token: string) =>
    http.request(`/organizations/${id}/customers`, token, {});

  const read = (id: string, token: string) =>
    http.request(`/organizations/${id}/customers`, token);

  const status = async (id: string, token: string) =>
    (await (
      await http.request(`/organizations/${id}/subscription/status`, token)
    ).json()) as Status;

  const code = async (response: Response) =>
    ((await response.json()) as { code: string }).code;

  describe("etapas", () => {
    it("en prueba y en gracia todo funciona", async () => {
      const { id, owner } = await pharmacy(-5);
      expect((await write(id, owner)).status).toBe(400);

      await overdue(id, 5);

      expect((await write(id, owner)).status).toBe(400);
    });

    it("en solo lectura se lee pero no se escribe", async () => {
      const { id, owner } = await pharmacy(15);

      const response = await write(id, owner);

      expect(response.status).toBe(402);
      expect(await code(response)).toBe("SUBSCRIPTION_READ_ONLY");
      expect((await read(id, owner)).status).toBe(200);
    });

    it("en solo lectura se termina lo pendiente", async () => {
      const { id, owner, branchId } = await pharmacy(15);
      const pending = [
        `/organizations/${id}/branches/${branchId}/cash/sessions/${randomUUID()}/close`,
        `/organizations/${id}/branches/${branchId}/transfers/${randomUUID()}/receive`,
        `/organizations/${id}/branches/${branchId}/sales/${randomUUID()}/invoice/process`,
      ];

      for (const path of pending)
        expect((await http.request(path, owner, {})).status).not.toBe(402);
    });

    it("bloqueada no se lee ni se termina nada", async () => {
      const { id, owner, branchId } = await pharmacy(40);

      const reading = await read(id, owner);
      const closing = await http.request(
        `/organizations/${id}/branches/${branchId}/cash/sessions/${randomUUID()}/close`,
        owner,
        {},
      );

      expect(reading.status).toBe(402);
      expect(await code(reading)).toBe("SUBSCRIPTION_BLOCKED");
      expect(closing.status).toBe(402);
    });

    it("bloqueada, el dueño ve sus ventas y el empleado no", async () => {
      const { id, owner, employee, branchId } = await pharmacy(40);
      const sales = `/organizations/${id}/branches/${branchId}/sales`;

      expect((await http.request(sales, owner)).status).toBe(200);
      expect(
        (await http.request(`/organizations/${id}/branches`, owner)).status,
      ).toBe(200);
      expect((await http.request(sales, employee)).status).toBe(402);
    });

    it("una suspendida se corta aunque esté al día", async () => {
      const { id, owner } = await pharmacy(-5);
      await http.db.organizationSubscription.update({
        where: { organizationId: id },
        data: { suspendedAt: new Date() },
      });

      const response = await read(id, owner);

      expect(response.status).toBe(402);
      expect(
        ((await response.json()) as { message: string }).message,
      ).toContain("suspendida");
    });
  });

  describe("nunca corta", () => {
    it("a una exenta, aunque sus fechas estén vencidas", async () => {
      const { id, owner } = await pharmacy(90);
      await http.db.organizationSubscription.update({
        where: { organizationId: id },
        data: { exempt: true },
      });

      expect((await write(id, owner)).status).toBe(400);
    });

    it("a una farmacia sin suscripción", async () => {
      const { id, owner } = await pharmacy(90);
      await http.db.organizationSubscription.delete({
        where: { organizationId: id },
      });

      expect((await write(id, owner)).status).toBe(400);
    });

    it("la sesión, el perfil y el cambio de clave", async () => {
      const { owner } = await pharmacy(90);

      expect((await http.request("/auth/me", owner)).status).toBe(200);
    });

    it("el panel de plataforma", async () => {
      const { id } = await pharmacy(90);

      expect(
        (await http.request(`/platform/organizations/${id}`, admin)).status,
      ).toBe(200);
    });

    it("a quien no es de la farmacia, que recibe su error de siempre", async () => {
      const blocked = await pharmacy(40);
      const other = await pharmacy(-5);

      // Con datos válidos, para llegar al permiso: con datos inválidos sería un 400.
      const response = await http.request(
        `/organizations/${blocked.id}/customers`,
        other.owner,
        { name: "Cliente ajeno" },
      );

      expect(response.status).toBe(403);
      expect(
        (
          await http.request(
            `/organizations/${blocked.id}/subscription/status`,
            other.owner,
          )
        ).status,
      ).toBe(403);
    });
  });

  describe("reactivar", () => {
    it("un pago desbloquea al instante", async () => {
      const { id, owner } = await pharmacy(40);
      expect((await write(id, owner)).status).toBe(402);

      await http.request(`/platform/organizations/${id}/payments`, admin, {
        operationId: randomUUID(),
        amountMinor: "10000",
        paidOn: today,
        method: "TRANSFER",
      });

      expect((await write(id, owner)).status).toBe(400);
    });

    it("una prórroga también", async () => {
      const { id, owner } = await pharmacy(40);

      await http.request(`/platform/organizations/${id}/extension`, admin, {
        until: addDays(today, 5),
        reason: "Paga el viernes",
      });

      expect((await write(id, owner)).status).toBe(400);
    });
  });

  describe("estado para la farmacia", () => {
    it("bloqueada sigue respondiendo, con el saldo solo para el dueño", async () => {
      const { id, owner, employee } = await pharmacy(40);

      const forOwner = await status(id, owner);
      const forEmployee = await status(id, employee);

      expect(forOwner).toMatchObject({ access: "BLOCKED", isOwner: true });
      expect(forOwner.balanceMinor).toMatch(/^\d+$/);
      expect(forEmployee).toMatchObject({
        access: "BLOCKED",
        isOwner: false,
        balanceMinor: null,
      });
    });

    it("en gracia avisa cuándo pasa a solo lectura", async () => {
      const { id, owner } = await pharmacy(5);

      expect((await status(id, owner)).nextCut).toEqual({
        access: "READ_ONLY",
        on: addDays(today, 6),
        inDays: 6,
      });
    });

    it("antes de vencer dice cuántos días quedan", async () => {
      const { id, owner } = await pharmacy(-3);

      expect(await status(id, owner)).toMatchObject({
        stage: "TRIAL",
        daysLeft: 3,
        nextCut: null,
      });
    });

    it("una exenta no tiene avisos", async () => {
      const { id, owner } = await pharmacy(40);
      await http.db.organizationSubscription.update({
        where: { organizationId: id },
        data: { exempt: true },
      });

      expect(await status(id, owner)).toMatchObject({
        stage: "EXEMPT",
        access: "FULL",
        daysLeft: null,
        balanceMinor: null,
      });
    });
  });

  it("el panel muestra el próximo corte de cada farmacia", async () => {
    const { id } = await pharmacy(15);

    const rows = (await (
      await http.request("/platform/organizations", admin)
    ).json()) as { id: string; subscription: { nextCut: unknown } }[];

    expect(rows.find((row) => row.id === id)?.subscription.nextCut).toEqual({
      access: "BLOCKED",
      on: addDays(today, 15),
      inDays: 15,
    });
  });
});
