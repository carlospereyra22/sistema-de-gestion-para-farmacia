import { SalesService } from "./sales.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
function setup(allowed = true) {
  const prisma = {
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue({
        active: allowed,
        displayName: "Carlos",
        roles: [
          { role: { permissions: [{ permission: { code: "SALE_READ" } }] } },
        ],
      }),
    },
    sale: {
      findFirst: jest.fn().mockResolvedValue({
        id: "abcd1234-test",
        completedAt: new Date("2026-09-13T15:00:00Z"),
        status: "COMPLETED",
        totalMinor: 1500n,
        customerId: "customer",
        items: [
          {
            productId: "product",
            quantity: 2,
            unitPriceMinor: 1000n,
            discountMinor: 500n,
          },
        ],
        payments: [{ method: "CASH", amountMinor: 2000n }],
      }),
    },
    branch: {
      findFirst: jest.fn().mockResolvedValue({
        name: "Central",
        organization: { name: "Farmacia Juncos" },
      }),
    },
    product: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "product", name: "Producto" }]),
    },
    customer: { findFirst: jest.fn().mockResolvedValue({ name: "Cliente" }) },
    auditLog: {
      findFirst: jest.fn().mockResolvedValue({ actorId: "cashier" }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ email: "cajero@example.com" }),
    },
  };
  return {
    prisma,
    service: new SalesService(
      prisma as unknown as PrismaService,
      {} as AuditService,
    ),
  };
}
it("maps only persisted sale prices, payments, discount and cashier in tenant scope", async () => {
  const { prisma, service } = setup();
  const ticket = await service.ticket(
    "reader",
    "org",
    "branch",
    "abcd1234-test",
  );
  expect(ticket).toMatchObject({
    number: "ABCD1234",
    subtotalMinor: "2000",
    discountMinor: "500",
    totalMinor: "1500",
    receivedMinor: "2000",
    changeMinor: "500",
    cashier: "Carlos",
  });
  expect(ticket.items[0]).toMatchObject({
    unitPriceMinor: "1000",
    amountMinor: "2000",
  });
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
  expect(prisma.sale.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        organizationId: "org",
        branchId: "branch",
        id: "abcd1234-test",
      }),
    }),
  );
});
it("requires read permission and does not disclose another tenant's sale", async () => {
  const denied = setup(false);
  await expect(
    denied.service.ticket("reader", "org", "branch", "id"),
  ).rejects.toThrow();
  expect(denied.prisma.sale.findFirst).not.toHaveBeenCalled();
  const absent = setup();
  absent.prisma.sale.findFirst.mockResolvedValue(null);
  await expect(
    absent.service.ticket("reader", "org", "branch", "id"),
  ).rejects.toThrow("Comprobante no encontrado");
});
