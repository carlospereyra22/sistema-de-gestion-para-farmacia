import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PlatformBillingService } from "../src/platform/platform-billing.service";
import { createPlatformAdmin } from "../src/platform/platform-admin.commands";
import { commercialToday } from "../src/platform/subscription-access";
import { addDays } from "../src/platform/subscription-ledger";
import { totpCode, totpStep } from "../src/platform/totp";
import { startHttpApp, type HttpApp } from "./support/http-app";

type Detail = {
  billing: {
    balanceMinor: string;
    creditMinor: string;
    charges: {
      id: string;
      periodStart: string;
      amountMinor: string;
      balanceMinor: string;
      waived: boolean;
    }[];
    payments: { id: string; voided: boolean; voidReason: string | null }[];
  };
  subscription: {
    stage: string;
    paidThrough: string | null;
    extendedUntil: string | null;
    extendedReason: string | null;
  };
};

describe("cargos y pagos por HTTP (esquema aislado)", () => {
  const password = "clave-de-plataforma-1234";
  const today = commercialToday(new Date());
  let http: HttpApp;
  let admin: string;
  let billing: PlatformBillingService;

  beforeAll(async () => {
    process.env.FISCAL_VAULT_KEY = "ab".repeat(32);
    http = await startHttpApp("platform_billing");
    billing = http.app.get(PlatformBillingService);
    const email = `${randomUUID()}@example.invalid`;
    await createPlatformAdmin(http.db, email, await hash(password));
    admin = await http.login(email, password);
    const enrollment = await http.request("/platform/totp/enroll", admin, {});
    const { secret } = (await enrollment.json()) as { secret: string };
    await http.request("/platform/totp/confirm", admin, {
      code: totpCode(secret, totpStep(new Date())),
    });
    await http.db.subscriptionPlan.updateMany({
      data: { baseMinor: 10000n },
    });
  }, 100000);

  afterAll(async () => {
    await http?.close();
    delete process.env.FISCAL_VAULT_KEY;
  });

  /** Farmacia cuya prueba terminó hace `daysAgo` días. */
  async function pharmacy(daysAgo = 1) {
    const response = await http.request("/platform/organizations", admin, {
      organizationName: "Farmacia",
      branchName: "Central",
      ownerEmail: `${randomUUID()}@example.invalid`,
      trialDays: 14,
    });
    const { id } = (await response.json()) as { id: string };
    await http.db.organizationSubscription.update({
      where: { organizationId: id },
      data: {
        trialEndsAt: new Date(`${addDays(today, -daysAgo)}T00:00:00.000Z`),
      },
    });
    return id;
  }

  const detail = async (id: string) =>
    (await (
      await http.request(`/platform/organizations/${id}`, admin)
    ).json()) as Detail;

  const pay = (id: string, amountMinor: string, extra: object = {}) =>
    http.request(`/platform/organizations/${id}/payments`, admin, {
      operationId: randomUUID(),
      amountMinor,
      paidOn: today,
      method: "TRANSFER",
      ...extra,
    });

  describe("generar cargos", () => {
    it("genera el mes al terminar la prueba, con el importe del plan", async () => {
      const id = await pharmacy();

      await billing.generateDueCharges(new Date());

      const { billing: ledger } = await detail(id);
      expect(ledger.charges).toHaveLength(1);
      expect(ledger.charges[0]).toMatchObject({
        periodStart: today,
        amountMinor: "10000",
        balanceMinor: "10000",
      });
      expect(ledger.balanceMinor).toBe("10000");
    });

    it("correrlo dos veces no duplica", async () => {
      const id = await pharmacy();

      await billing.generateDueCharges(new Date());
      await billing.generateDueCharges(new Date());

      expect((await detail(id)).billing.charges).toHaveLength(1);
    });

    it("se pone al día si la API estuvo apagada", async () => {
      const id = await pharmacy(40);
      await http.db.subscriptionPayment.create({
        data: {
          organizationId: id,
          operationId: randomUUID(),
          requestHash: "x",
          amountMinor: 100000n,
          paidOn: new Date(`${today}T00:00:00.000Z`),
          method: "CASH",
          createdById: randomUUID(),
        },
      });

      await billing.generateDueCharges(new Date());

      const { billing: ledger } = await detail(id);
      expect(ledger.charges).toHaveLength(2);
      expect(ledger.creditMinor).toBe("80000");
    });

    it("una farmacia en prueba todavía no tiene cargos", async () => {
      const id = await pharmacy(-20);

      await billing.generateDueCharges(new Date());

      expect((await detail(id)).billing.charges).toHaveLength(0);
    });

    it("una farmacia exenta nunca tiene cargos", async () => {
      const id = await pharmacy();
      await http.db.organizationSubscription.update({
        where: { organizationId: id },
        data: { exempt: true },
      });

      await billing.generateDueCharges(new Date());

      expect((await detail(id)).billing.charges).toHaveLength(0);
    });

    it("una bloqueada deja de acumular deuda", async () => {
      const id = await pharmacy(90);

      await billing.generateDueCharges(new Date());

      const { billing: ledger, subscription } = await detail(id);
      expect(subscription.stage).toBe("BLOCKED");
      expect(ledger.charges).toHaveLength(1);
    });

    it("una bloqueada que salda su deuda no queda trabada", async () => {
      const id = await pharmacy(120);
      await billing.generateDueCharges(new Date());

      await pay(id, "10000");

      const { billing: ledger } = await detail(id);
      expect(ledger.charges.some(({ waived }) => waived)).toBe(true);
      expect(ledger.balanceMinor).not.toBe("0");

      await pay(id, ledger.balanceMinor);

      expect((await detail(id)).subscription.stage).not.toBe("BLOCKED");
    });

    it("un error en una farmacia no frena a las demás", async () => {
      const broken = await pharmacy();
      const healthy = await pharmacy();
      await http.db.$executeRawUnsafe(`
        CREATE FUNCTION rechazar_cargo() RETURNS trigger AS $$
        BEGIN
          IF NEW."organizationId" = '${broken}'::uuid THEN
            RAISE EXCEPTION 'cargo rechazado';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await http.db.$executeRawUnsafe(`
        CREATE TRIGGER rechazar_cargo BEFORE INSERT ON "SubscriptionCharge"
        FOR EACH ROW EXECUTE FUNCTION rechazar_cargo()`);

      await billing.generateDueCharges(new Date());

      await http.db.$executeRawUnsafe(
        'DROP TRIGGER rechazar_cargo ON "SubscriptionCharge"',
      );
      await http.db.$executeRawUnsafe("DROP FUNCTION rechazar_cargo");
      expect((await detail(broken)).billing.charges).toHaveLength(0);
      expect((await detail(healthy)).billing.charges).toHaveLength(1);
    });

    it("el cargo guarda el importe: subir precios no cambia lo ya generado", async () => {
      const id = await pharmacy();
      await billing.generateDueCharges(new Date());

      await http.db.subscriptionPlan.updateMany({
        data: { baseMinor: 99999n },
      });
      const { billing: ledger } = await detail(id);
      await http.db.subscriptionPlan.updateMany({
        data: { baseMinor: 10000n },
      });

      expect(ledger.charges[0]?.amountMinor).toBe("10000");
    });
  });

  describe("registrar pagos", () => {
    async function withCharge() {
      const id = await pharmacy();
      await billing.generateDueCharges(new Date());
      return id;
    }

    it("el pago completo cubre el mes y deja la farmacia al día", async () => {
      const id = await withCharge();

      expect((await pay(id, "10000")).status).toBe(201);

      const { billing: ledger, subscription } = await detail(id);
      expect(ledger.balanceMinor).toBe("0");
      expect(subscription.stage).toBe("ACTIVE");
      expect(subscription.paidThrough).not.toBeNull();
    });

    it("un pago parcial baja el saldo y no adelanta la fecha", async () => {
      const id = await withCharge();

      await pay(id, "6000");

      const { billing: ledger, subscription } = await detail(id);
      expect(ledger.balanceMinor).toBe("4000");
      expect(subscription.paidThrough).toBeNull();
    });

    it("un doble clic no registra dos pagos", async () => {
      const id = await withCharge();
      const operationId = randomUUID();

      const first = await pay(id, "6000", { operationId });
      const second = await pay(id, "6000", { operationId });

      expect(await first.json()).toEqual(await second.json());
      expect((await detail(id)).billing.payments).toHaveLength(1);
    });

    it("la misma operación con otro importe se rechaza", async () => {
      const id = await withCharge();
      const operationId = randomUUID();
      await pay(id, "6000", { operationId });

      const response = await pay(id, "7000", { operationId });

      expect(response.status).toBe(409);
    });

    it("dos pagos al mismo tiempo se registran los dos, bien imputados", async () => {
      const id = await withCharge();

      const results = await Promise.all([pay(id, "6000"), pay(id, "4000")]);

      expect(results.map(({ status }) => status)).toEqual([201, 201]);
      const { billing: ledger, subscription } = await detail(id);
      expect(ledger.balanceMinor).toBe("0");
      expect(subscription.paidThrough).not.toBeNull();
    });

    it.each([
      ["en cero", { amountMinor: "0" }],
      ["con fecha futura", { paidOn: addDays(today, 2) }],
      ["con una fecha imposible", { paidOn: "2026-13-45" }],
      ["con un medio desconocido", { method: "BITCOIN" }],
    ])("rechaza un pago %s", async (_name, extra) => {
      const id = await withCharge();

      const response = await pay(id, "10000", extra);

      expect(response.status).toBe(400);
      expect((await detail(id)).billing.payments).toHaveLength(0);
    });

    it("una farmacia exenta no registra pagos", async () => {
      const id = await pharmacy();
      await http.db.organizationSubscription.update({
        where: { organizationId: id },
        data: { exempt: true },
      });

      expect((await pay(id, "10000")).status).toBe(409);
    });

    it("queda en la auditoría de la plataforma", async () => {
      const id = await withCharge();

      await pay(id, "10000");

      await expect(
        http.db.platformAuditLog.count({
          where: {
            organizationId: id,
            action: "PLATFORM_PAYMENT_REGISTERED",
          },
        }),
      ).resolves.toBe(1);
    });
  });

  describe("anular y condonar", () => {
    async function paid() {
      const id = await pharmacy();
      await billing.generateDueCharges(new Date());
      const response = await pay(id, "10000");
      return {
        id,
        paymentId: ((await response.json()) as { id: string }).id,
      };
    }

    const voidPayment = (id: string, paymentId: string, reason: string) =>
      http.request(
        `/platform/organizations/${id}/payments/${paymentId}/void`,
        admin,
        { reason },
      );

    it("anular conserva el pago y hace retroceder la fecha", async () => {
      const { id, paymentId } = await paid();

      expect((await voidPayment(id, paymentId, "Mal cargado")).status).toBe(
        200,
      );

      const { billing: ledger, subscription } = await detail(id);
      expect(ledger.payments[0]).toMatchObject({
        voided: true,
        voidReason: "Mal cargado",
      });
      expect(ledger.balanceMinor).toBe("10000");
      expect(subscription.paidThrough).toBeNull();
    });

    it("no se anula dos veces", async () => {
      const { id, paymentId } = await paid();
      await voidPayment(id, paymentId, "Mal cargado");

      expect((await voidPayment(id, paymentId, "Otra vez")).status).toBe(409);
    });

    it("exige motivo", async () => {
      const { id, paymentId } = await paid();

      expect((await voidPayment(id, paymentId, "")).status).toBe(400);
      expect((await voidPayment(id, paymentId, "    ")).status).toBe(400);
    });

    it("no alcanza el pago de otra farmacia", async () => {
      const { paymentId } = await paid();
      const other = await pharmacy();

      expect((await voidPayment(other, paymentId, "Mal")).status).toBe(404);
    });

    it("condonar cubre el período sin registrar un pago", async () => {
      const id = await pharmacy();
      await billing.generateDueCharges(new Date());
      const { billing: before } = await detail(id);

      const response = await http.request(
        `/platform/organizations/${id}/charges/${before.charges[0]!.id}/waive`,
        admin,
        { reason: "Cortesía" },
      );

      expect(response.status).toBe(200);
      const { billing: ledger, subscription } = await detail(id);
      expect(ledger.balanceMinor).toBe("0");
      expect(ledger.charges[0]?.waived).toBe(true);
      expect(ledger.payments).toHaveLength(0);
      expect(subscription.paidThrough).not.toBeNull();
    });
  });

  describe("prórroga", () => {
    const extend = (id: string, until: string | null, reason: string) =>
      http.request(`/platform/organizations/${id}/extension`, admin, {
        until,
        reason,
      });

    it("evita el corte hasta la fecha y queda el motivo", async () => {
      const id = await pharmacy(20);
      const until = addDays(today, 15);

      expect((await extend(id, until, "Inundación")).status).toBe(200);

      expect((await detail(id)).subscription).toMatchObject({
        stage: "EXTENDED",
        extendedUntil: until,
        extendedReason: "Inundación",
      });
    });

    it("se puede quitar", async () => {
      const id = await pharmacy(20);
      await extend(id, addDays(today, 15), "Inundación");

      await extend(id, null, "Pagó antes");

      expect((await detail(id)).subscription).toMatchObject({
        stage: "READ_ONLY",
        extendedUntil: null,
      });
    });

    it("no puede terminar en el pasado", async () => {
      const id = await pharmacy();

      expect((await extend(id, addDays(today, -1), "Mal")).status).toBe(400);
    });

    it("rechaza una fecha imposible", async () => {
      const id = await pharmacy();

      expect((await extend(id, "2026-13-45", "Mal")).status).toBe(400);
    });

    it("exige motivo", async () => {
      const id = await pharmacy();

      expect((await extend(id, addDays(today, 5), "")).status).toBe(400);
    });

    it("una cuota: pago parcial más prórroga hasta la próxima", async () => {
      const id = await pharmacy(5);
      await billing.generateDueCharges(new Date());

      await pay(id, "4000");
      await extend(id, addDays(today, 30), "Paga en cuotas");

      const { billing: ledger, subscription } = await detail(id);
      expect(ledger.balanceMinor).not.toBe("0");
      expect(subscription.stage).toBe("EXTENDED");
    });
  });

  it("la lista muestra el saldo de cada farmacia", async () => {
    const id = await pharmacy();
    await billing.generateDueCharges(new Date());
    await pay(id, "4000");

    const response = await http.request("/platform/organizations", admin);

    const rows = (await response.json()) as {
      id: string;
      balanceMinor: string;
    }[];
    expect(rows.find((row) => row.id === id)?.balanceMinor).toBe("6000");
  });

  it("el listado suma lo cobrado en el mes, sin los anulados", async () => {
    type Overview = {
      collectedThisMonthMinor: string;
      payments: { organizationId: string; organizationName: string }[];
    };
    const overview = async () =>
      (await (
        await http.request("/platform/payments", admin)
      ).json()) as Overview;
    const before = BigInt((await overview()).collectedThisMonthMinor);
    const id = await pharmacy();
    await billing.generateDueCharges(new Date());
    await pay(id, "3000");
    const voided = await pay(id, "2000");
    const { id: paymentId } = (await voided.json()) as { id: string };
    await http.request(
      `/platform/organizations/${id}/payments/${paymentId}/void`,
      admin,
      { reason: "Mal cargado" },
    );

    const after = await overview();

    expect(BigInt(after.collectedThisMonthMinor) - before).toBe(3000n);
    expect(after.payments[0]).toMatchObject({
      organizationId: id,
      organizationName: "Farmacia",
    });
  });

  it("nada de esto existe para quien no es administrador", async () => {
    const id = await pharmacy();

    const response = await http.request(
      `/platform/organizations/${id}/payments`,
      undefined,
      {},
    );
    const overview = await http.request("/platform/payments");

    expect(response.status).toBe(404);
    expect(overview.status).toBe(404);
  });
});
