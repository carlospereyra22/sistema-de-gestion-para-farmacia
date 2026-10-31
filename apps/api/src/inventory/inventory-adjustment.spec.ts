import { InventoryService } from "./inventory.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

describe("stock adjustment validation", () => {
  it("explains a zero variation in Spanish before writing stock or movements", async () => {
    const transaction = jest.fn();
    const prisma = {
      userOrganization: {
        findUnique: jest.fn().mockResolvedValue({
          active: true,
          roles: [
            {
              role: {
                permissions: [{ permission: { code: "INVENTORY_MANAGE" } }],
              },
            },
          ],
        }),
      },
      $transaction: transaction,
    } as unknown as PrismaService;
    const record = jest.fn();
    const service = new InventoryService(prisma, {
      recordInTransaction: record,
    } as unknown as AuditService);
    await expect(
      service.adjust("actor", {
        organizationId: "org",
        branchId: "branch",
        lotId: "lot",
        quantity: 0,
        reason: "Corrección",
      }),
    ).rejects.toThrow("La variación de cantidad no puede ser 0");
    expect(transaction).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
