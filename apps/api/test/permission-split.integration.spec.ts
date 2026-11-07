import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash } from "@node-rs/argon2";
import { startHttpApp, type HttpApp } from "./support/http-app";

describe("permisos separados de mercadería por HTTP (esquema aislado)", () => {
  const password = "clave-de-prueba-1234";
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  let http: HttpApp;
  let passwordHash: string;

  beforeAll(async () => {
    http = await startHttpApp("permission_split");
    passwordHash = await hash(password);
  }, 100000);

  afterAll(async () => {
    await http?.close();
  });

  async function pharmacy() {
    const organization = await http.db.organization.create({
      data: { name: "Farmacia" },
    });
    const branch = await http.db.branch.create({
      data: { organizationId: organization.id, name: "Central", code: "C" },
    });
    const supplier = await http.db.supplier.create({
      data: { organizationId: organization.id, name: "Droguería" },
    });
    const product = await http.db.product.create({
      data: { organizationId: organization.id, name: "Producto" },
    });
    const base = `/organizations/${organization.id}/branches/${branch.id}`;

    const member = async (codes: string[]) => {
      const permissions = await Promise.all(
        codes.map((code) =>
          http.db.permission.upsert({
            where: { code },
            update: {},
            create: { code, description: code },
          }),
        ),
      );
      const role = await http.db.role.create({
        data: {
          organizationId: organization.id,
          code: `ROL_${randomUUID().slice(0, 8).toUpperCase()}`,
          name: "Rol",
          permissions: {
            create: permissions.map(({ id }) => ({ permissionId: id })),
          },
        },
      });
      const email = `${randomUUID()}@example.invalid`;
      await http.db.user.create({
        data: {
          email,
          passwordHash,
          organizations: {
            create: {
              organizationId: organization.id,
              roles: { create: { roleId: role.id } },
            },
          },
          branches: { create: { branchId: branch.id } },
        },
      });
      return http.login(email, password);
    };

    const purchase = async () => {
      const buyer = await member(["PURCHASE_MANAGE", "PURCHASE_READ"]);
      const response = await http.request(`${base}/purchases`, buyer, {
        clientOperationId: randomUUID(),
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 5, unitCostMinor: 1500 }],
      });
      expect(response.status).toBe(201);
      const { id } = (await response.json()) as { id: string };
      const detail = await http.request(`${base}/purchases/${id}`, buyer);
      const body = (await detail.json()) as { items: { id: string }[] };
      return { id, itemId: body.items[0]!.id };
    };

    const invoice = async () => {
      const clerk = await member(["PAYABLE_MANAGE", "PAYABLE_READ"]);
      const response = await http.request(`${base}/supplier-payables`, clerk, {
        operationId: randomUUID(),
        supplierId: supplier.id,
        documentType: "FACTURA_A",
        pointOfSale: "0003",
        documentNumber: randomUUID().replaceAll("-", "").slice(0, 8),
        issuedOn: today,
        amountMinor: "10000",
        dues: [{ dueOn: null, amountMinor: "10000" }],
      });
      expect(response.status).toBe(201);
      return ((await response.json()) as { id: string }).id;
    };

    return { organization, base, member, purchase, invoice, supplier, product };
  }

  const reception = (itemId: string, extra: object = {}) => ({
    operationId: randomUUID(),
    items: [
      { itemId, quantity: 2, lotNumber: `L-${randomUUID().slice(0, 6)}` },
    ],
    ...extra,
  });

  const payment = (extra: object = {}) => ({
    operationId: randomUUID(),
    amountMinor: "10000",
    expectedBalanceMinor: "10000",
    paidOn: today,
    method: "TRANSFER",
    ...extra,
  });

  describe("quien solo recibe", () => {
    it("ve las compras sin costos y puede recibir", async () => {
      const { base, member, purchase } = await pharmacy();
      const { id, itemId } = await purchase();
      const token = await member(["PURCHASE_RECEIVE"]);

      const list = await (
        await http.request(`${base}/purchases`, token)
      ).text();
      const detail = await (
        await http.request(`${base}/purchases/${id}`, token)
      ).text();
      expect(list).toContain(id);
      expect(list).not.toContain("unitCostMinor");
      expect(detail).not.toContain("unitCostMinor");
      expect(detail).not.toContain("1500");
      expect(JSON.parse(detail)).toMatchObject({ canRegisterDebt: false });

      const received = await http.request(
        `${base}/purchases/${id}/receipts/batch`,
        token,
        reception(itemId),
      );
      expect(received.status).toBe(201);
    });

    it("no puede comprar", async () => {
      const { base, member, supplier, product } = await pharmacy();
      const token = await member(["PURCHASE_RECEIVE"]);

      const response = await http.request(`${base}/purchases`, token, {
        clientOperationId: randomUUID(),
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitCostMinor: 100 }],
      });

      expect(response.status).toBe(403);
    });

    it("no puede cargar la deuda, y si lo intenta no se recibe nada", async () => {
      const { base, member, purchase } = await pharmacy();
      const { id, itemId } = await purchase();
      const token = await member(["PURCHASE_RECEIVE"]);

      const response = await http.request(
        `${base}/purchases/${id}/receipts/batch`,
        token,
        reception(itemId, { debt: { amountMinor: "3000", dueOn: null } }),
      );

      expect(response.status).toBe(403);
      await expect(
        http.db.purchaseItem.findUniqueOrThrow({ where: { id: itemId } }),
      ).resolves.toMatchObject({ receivedQuantity: 0 });
    });

    it("con Ver compras además ve los costos", async () => {
      const { base, member, purchase } = await pharmacy();
      const { id } = await purchase();
      const token = await member(["PURCHASE_RECEIVE", "PURCHASE_READ"]);

      const detail = await http.request(`${base}/purchases/${id}`, token);

      expect(await detail.text()).toContain('"unitCostMinor":"1500"');
    });
  });

  describe("quien solo compra", () => {
    it("no puede recibir", async () => {
      const { base, member, purchase } = await pharmacy();
      const { id, itemId } = await purchase();
      const token = await member(["PURCHASE_MANAGE", "PURCHASE_READ"]);

      const response = await http.request(
        `${base}/purchases/${id}/receipts/batch`,
        token,
        reception(itemId),
      );

      expect(response.status).toBe(403);
    });

    it("no puede hacer una compra directa, que además recibe", async () => {
      const { base, member, supplier, product } = await pharmacy();
      const body = {
        clientOperationId: randomUUID(),
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitCostMinor: 100 }],
        receipts: [{ productId: product.id, quantity: 1, lotNumber: "D-1" }],
      };

      const denied = await http.request(
        `${base}/purchases/direct`,
        await member(["PURCHASE_MANAGE"]),
        body,
      );
      const allowed = await http.request(
        `${base}/purchases/direct`,
        await member(["PURCHASE_MANAGE", "PURCHASE_RECEIVE"]),
        body,
      );

      expect(denied.status).toBe(403);
      expect(allowed.status).toBe(201);
    });
  });

  describe("cargar la factura y pagarla son tareas distintas", () => {
    it("quien carga facturas no puede pagar", async () => {
      const { base, member, invoice } = await pharmacy();
      const id = await invoice();
      const token = await member(["PAYABLE_READ", "PAYABLE_MANAGE"]);

      const paid = await http.request(
        `${base}/supplier-payables/${id}/payments`,
        token,
        payment(),
      );
      const list = await http.request(`${base}/supplier-payables`, token);

      expect(paid.status).toBe(403);
      expect(await list.json()).toMatchObject({
        canCreate: true,
        canPay: false,
      });
    });

    it("quien paga no puede cargar facturas", async () => {
      const { base, member, invoice, supplier } = await pharmacy();
      const id = await invoice();
      const token = await member(["PAYABLE_READ", "PAYABLE_PAY"]);

      const paid = await http.request(
        `${base}/supplier-payables/${id}/payments`,
        token,
        payment(),
      );
      const created = await http.request(`${base}/supplier-payables`, token, {
        operationId: randomUUID(),
        supplierId: supplier.id,
        documentType: "FACTURA_A",
        pointOfSale: "0003",
        documentNumber: "99999999",
        issuedOn: today,
        amountMinor: "100",
        dues: [{ dueOn: null, amountMinor: "100" }],
      });

      expect(paid.status).toBe(201);
      expect(created.status).toBe(403);
    });
  });

  describe("lo que necesita cualquier rol para operar", () => {
    it("ve sus sucursales sin ORGANIZATION_READ, y solo esas", async () => {
      const { organization, member } = await pharmacy();
      await http.db.branch.create({
        data: { organizationId: organization.id, name: "Otra", code: "OTRA" },
      });
      const path = `/organizations/${organization.id}/branches`;

      const own = await http.request(path, await member(["SALE_READ"]));
      const all = await http.request(path, await member(["ORGANIZATION_READ"]));

      expect(own.status).toBe(200);
      expect(await own.json()).toEqual([
        expect.objectContaining({ name: "Central", canAccess: true }),
      ]);
      expect((await all.json()) as unknown[]).toHaveLength(2);
    });

    it("lee el encabezado del ticket sin ORGANIZATION_READ", async () => {
      const { organization, member } = await pharmacy();

      const response = await http.request(
        `/organizations/${organization.id}/ticket-header`,
        await member(["SALE_READ"]),
      );

      expect(response.status).toBe(200);
    });

    it("no alcanza a otra farmacia", async () => {
      const { member } = await pharmacy();
      const other = await pharmacy();
      const token = await member(["SALE_READ"]);
      const base = `/organizations/${other.organization.id}`;

      expect((await http.request(`${base}/branches`, token)).status).toBe(403);
      expect((await http.request(`${base}/ticket-header`, token)).status).toBe(
        403,
      );
    });
  });

  describe("la migración", () => {
    it("le da los permisos nuevos a quien ya podía, y a nadie más", async () => {
      const { organization } = await pharmacy();
      const role = (code: string, permission: string) =>
        http.db.role.create({
          data: {
            organizationId: organization.id,
            code,
            name: code,
            permissions: {
              create: {
                permission: {
                  connectOrCreate: {
                    where: { code: permission },
                    create: { code: permission, description: permission },
                  },
                },
              },
            },
          },
        });
      const buyer = await role("COMPRADOR", "PURCHASE_MANAGE");
      const clerk = await role("ADMINISTRATIVO", "PAYABLE_MANAGE");
      const seller = await role("VENDEDOR", "SALE_MANAGE");

      const sql = readFileSync(
        join(
          __dirname,
          "../prisma/migrations/20261106080000_split_purchase_payable_permissions/migration.sql",
        ),
        "utf8",
      );
      for (const statement of sql
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean))
        await http.db.$executeRawUnsafe(statement);

      const codes = async (roleId: string) =>
        (
          await http.db.rolePermission.findMany({
            where: { roleId },
            select: { permission: { select: { code: true } } },
          })
        )
          .map(({ permission }) => permission.code)
          .sort();
      await expect(codes(buyer.id)).resolves.toEqual([
        "PURCHASE_MANAGE",
        "PURCHASE_RECEIVE",
      ]);
      await expect(codes(clerk.id)).resolves.toEqual([
        "PAYABLE_MANAGE",
        "PAYABLE_PAY",
      ]);
      await expect(codes(seller.id)).resolves.toEqual(["SALE_MANAGE"]);
    });
  });

  describe("editar los permisos de un rol", () => {
    async function roleFixture(code = "EMPLEADO") {
      const fixture = await pharmacy();
      const role = await http.db.role.create({
        data: {
          organizationId: fixture.organization.id,
          code,
          name: code,
        },
      });
      const path = `/organizations/${fixture.organization.id}/roles/${role.id}/permissions`;
      return { ...fixture, role, path };
    }

    const patch = (path: string, token: string, permissionCodes: string[]) =>
      http.request(path, token, { permissionCodes }, "PATCH");

    it("el dueño activa una tarea y queda auditado", async () => {
      const { member, role, path, organization } = await roleFixture();
      const token = await member(["ROLE_MANAGE"]);
      await http.db.permission.upsert({
        where: { code: "PURCHASE_RECEIVE" },
        update: {},
        create: { code: "PURCHASE_RECEIVE", description: "x" },
      });

      expect((await patch(path, token, ["PURCHASE_RECEIVE"])).status).toBe(200);

      await expect(
        http.db.rolePermission.count({ where: { roleId: role.id } }),
      ).resolves.toBe(1);
      await expect(
        http.db.auditLog.findFirstOrThrow({
          where: {
            organizationId: organization.id,
            entityId: role.id,
            action: "ROLE_PERMISSIONS_UPDATED",
          },
        }),
      ).resolves.toMatchObject({
        before: { permissions: [] },
        after: { permissions: ["PURCHASE_RECEIVE"] },
      });
    });

    it("puede dejar un rol sin permisos", async () => {
      const { member, role, path } = await roleFixture();

      const response = await patch(path, await member(["ROLE_MANAGE"]), []);

      expect(response.status).toBe(200);
      await expect(
        http.db.rolePermission.count({ where: { roleId: role.id } }),
      ).resolves.toBe(0);
    });

    it("el rol OWNER no se edita", async () => {
      const { member, path } = await roleFixture("OWNER");

      const response = await patch(path, await member(["ROLE_MANAGE"]), []);

      expect(response.status).toBe(403);
    });

    it("rechaza un permiso inexistente sin tocar nada", async () => {
      const { member, path } = await roleFixture();

      const response = await patch(path, await member(["ROLE_MANAGE"]), [
        "PERMISO_INVENTADO",
      ]);

      expect(response.status).toBe(400);
    });

    it("sin ROLE_MANAGE no se puede", async () => {
      const { member, path } = await roleFixture();

      const response = await patch(path, await member(["ROLE_READ"]), []);

      expect(response.status).toBe(403);
    });

    it("no alcanza a un rol de otra farmacia", async () => {
      const { role } = await roleFixture();
      const other = await pharmacy();

      const response = await patch(
        `/organizations/${other.organization.id}/roles/${role.id}/permissions`,
        await other.member(["ROLE_MANAGE"]),
        [],
      );

      expect(response.status).toBe(404);
    });
  });
});
