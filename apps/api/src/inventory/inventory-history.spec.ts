import { InventoryService } from "./inventory.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

describe("inventory history", () => {
  function setup(allowed = true) {
    const movements = jest.fn().mockResolvedValue([
      {
        id: "movement",
        productId: "product",
        lotId: "lot",
        quantity: -2,
        type: "ADJUSTMENT_OUT",
      },
    ]);
    const prisma = {
      userOrganization: {
        findUnique: jest.fn().mockResolvedValue({
          active: true,
          roles: [
            {
              role: {
                permissions: allowed
                  ? [{ permission: { code: "INVENTORY_READ" } }]
                  : [],
              },
            },
          ],
        }),
      },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch" }) },
      inventoryMovement: { findMany: movements },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "product", name: "Actron" }]),
      },
      productLot: {
        findMany: jest.fn().mockResolvedValue([{ id: "lot", number: "123" }]),
      },
    };
    return {
      prisma,
      movements,
      service: new InventoryService(
        prisma as unknown as PrismaService,
        {} as AuditService,
      ),
    };
  }
  it("scopes movements and metadata to the organization and branch, including empty lots", async () => {
    const { service, movements, prisma } = setup();
    const result = await service.history("actor", "org", "branch");
    expect(movements).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org",
          branchId: "branch",
          type: {
            in: [
              "PURCHASE_RECEIPT",
              "ADJUSTMENT_IN",
              "ADJUSTMENT_OUT",
              "SUPPLIER_RETURN",
            ],
          },
        },
      }),
    );
    expect(prisma.productLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org",
          branchId: "branch",
          id: { in: ["lot"] },
        },
      }),
    );
    expect(result[0]).toMatchObject({
      productName: "Actron",
      lotNumber: "123",
      quantity: -2,
    });
  });
  it("does not query history without inventory read permission", async () => {
    const { service, movements } = setup(false);
    await expect(service.history("actor", "org", "branch")).rejects.toThrow();
    expect(movements).not.toHaveBeenCalled();
  });
});
