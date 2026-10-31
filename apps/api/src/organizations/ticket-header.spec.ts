import { validateSync } from "class-validator";
import { plainToInstance } from "class-transformer";
import {
  organizationTicketStore,
  readTicketHeader,
  TicketHeaderDto,
} from "./ticket-header";
import { OrganizationsService } from "./organizations.service";
import type { PrismaService } from "../prisma/prisma.service";

const header = {
  printDensity: 4,
  name: "Farmacia Juncos",
  address: "Av. Centenario 2606",
  city: "Posadas",
  province: "Misiones",
  taxId: "20-24723783-7",
  phone: "3765 035705",
};
it("validates and forwards bounded organization logo raster", () => {
  const logoRaster = "a5".repeat(2048);
  const input = { ...header, logoRaster };
  expect(validateSync(plainToInstance(TicketHeaderDto, input))).toHaveLength(0);
  expect(
    organizationTicketStore({ name: "Org", ticketHeader: input }).logoRaster,
  ).toBe(logoRaster);
  for (const logoRaster of ["bad", "f".repeat(4097), "\u001b@", 123]) {
    expect(
      validateSync(plainToInstance(TicketHeaderDto, { ...header, logoRaster }))
        .length,
    ).toBeGreaterThan(0);
  }
});
it("composes the saved organization header without example fallbacks", () => {
  expect(
    organizationTicketStore({ name: "Organización", ticketHeader: header }),
  ).toEqual({
    printDensity: 4,
    name: header.name,
    address: "Av. Centenario 2606 · Posadas, Misiones",
    contact: "CUIT 20-24723783-7 · Tel. 3765 035705",
  });
  expect(organizationTicketStore({ name: "Otra farmacia" })).toEqual({
    printDensity: 4,
    name: "Otra farmacia",
    address: "",
    contact: "",
  });
  expect(
    readTicketHeader({
      name: "Organización",
      ticketHeader: { ...header, phone: " " },
    }).phone,
  ).toBe("");
});
it("validates density and forwards the saved value to printing", () => {
  for (const printDensity of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const input = { ...header, printDensity };
    expect(validateSync(plainToInstance(TicketHeaderDto, input))).toHaveLength(
      0,
    );
    expect(
      organizationTicketStore({ name: "Org", ticketHeader: input })
        .printDensity,
    ).toBe(printDensity);
  }
  for (const printDensity of [0, 9, -1, 2.5, "3"]) {
    expect(
      validateSync(
        plainToInstance(TicketHeaderDto, { ...header, printDensity }),
      ).length,
    ).toBeGreaterThan(0);
  }
  expect(readTicketHeader({ name: "Org" }).printDensity).toBe(4);
});
it("validates bounds and control characters, allowing empty optional data", () => {
  expect(validateSync(plainToInstance(TicketHeaderDto, header))).toHaveLength(
    0,
  );
  for (const invalid of [
    { ...header, name: " " },
    { ...header, address: "x".repeat(161) },
    { ...header, phone: "\x1b@" },
  ])
    expect(
      validateSync(plainToInstance(TicketHeaderDto, invalid)).length,
    ).toBeGreaterThan(0);
});
it("saves only in the permitted organization and audits in the same transaction", async () => {
  const update = jest.fn().mockResolvedValue({});
  const audit = jest.fn().mockResolvedValue({});
  const member = jest.fn().mockResolvedValue({
    active: true,
    roles: [
      {
        role: {
          permissions: [{ permission: { code: "ORGANIZATION_MANAGE" } }],
        },
      },
    ],
  });
  const transaction = jest.fn(async (fn: (tx: object) => Promise<unknown>) =>
    fn({ organization: { update }, auditLog: { create: audit } }),
  );
  const service = new OrganizationsService({
    userOrganization: { findUnique: member },
    $transaction: transaction,
  } as unknown as PrismaService);
  await service.updateTicketHeader("actor", "org", header);
  expect(update).toHaveBeenCalledWith({
    where: { id: "org" },
    data: { ticketHeader: header },
  });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org",
        actorId: "actor",
        action: "TICKET_HEADER_UPDATED",
      }),
    }),
  );
  member.mockResolvedValue(null);
  await expect(
    service.updateTicketHeader("actor", "other-org", header),
  ).rejects.toThrow();
  expect(transaction).toHaveBeenCalledTimes(1);
});
