import { CatalogService } from "./catalog.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ForbiddenException, NotFoundException } from "@nestjs/common";

function setup() {
  const laboratory = {
    findFirst: jest
      .fn()
      .mockResolvedValue({ id: "lab", logo: Buffer.from("jpeg") }),
    update: jest.fn().mockResolvedValue({ id: "lab", logoUpdatedAt: null }),
  };
  const tx = {
    laboratory,
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    laboratory,
    $transaction: jest.fn(async (fn: (value: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const service = new CatalogService(prisma as unknown as PrismaService);
  const permission = jest
    .spyOn(service, "assertPermission")
    .mockResolvedValue(undefined);
  return { service, tx, prisma, permission };
}
it("stores a validated JPEG without including bytes in the audit", async () => {
  const { service, tx } = setup();
  const bytes = Buffer.from([
    255, 216, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1,
    0, 0, 63, 0, 255, 217,
  ]);
  await service.saveLaboratoryLogo(
    "actor",
    "org",
    "lab",
    `data:image/jpeg;base64,${bytes.toString("base64")}`,
  );
  expect(tx.laboratory.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { logo: new Uint8Array(bytes), logoUpdatedAt: expect.any(Date) },
    }),
  );
  expect(tx.auditLog.create).toHaveBeenCalledWith({
    data: {
      actorId: "actor",
      organizationId: "org",
      entityType: "LABORATORY",
      entityId: "lab",
      action: "LOGO_SAVED",
    },
  });
});
it("reads only an active laboratory within the authorized organization", async () => {
  const { service, tx, permission } = setup();
  expect(await service.laboratoryLogo("actor", "org", "lab")).toEqual({
    dataUrl: "data:image/jpeg;base64,anBlZw==",
  });
  expect(permission).toHaveBeenCalledWith("actor", "org", "CATALOG_READ");
  expect(tx.laboratory.findFirst).toHaveBeenCalledWith({
    where: { id: "lab", organizationId: "org", active: true },
    select: { logo: true },
  });
  tx.laboratory.findFirst.mockResolvedValue(null);
  await expect(service.laboratoryLogo("actor", "other", "lab")).rejects.toThrow(
    NotFoundException,
  );
});
it("removes the logo with its audit in the same transaction", async () => {
  const { service, tx, prisma, permission } = setup();
  await service.saveLaboratoryLogo("actor", "org", "lab", null);
  expect(permission).toHaveBeenCalledWith("actor", "org", "CATALOG_MANAGE");
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "Serializable",
  });
  expect(tx.laboratory.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { logo: null, logoUpdatedAt: null } }),
  );
  expect(tx.auditLog.create).toHaveBeenCalledWith({
    data: {
      actorId: "actor",
      organizationId: "org",
      entityType: "LABORATORY",
      entityId: "lab",
      action: "LOGO_REMOVED",
    },
  });
});
it("rejects forbidden writes and invalid images before writing", async () => {
  const { service, tx, permission } = setup();
  await expect(
    service.saveLaboratoryLogo(
      "actor",
      "org",
      "lab",
      "data:image/svg+xml;base64,AAAA",
    ),
  ).rejects.toThrow();
  permission.mockRejectedValue(new ForbiddenException());
  await expect(
    service.saveLaboratoryLogo("actor", "org", "lab", null),
  ).rejects.toThrow(ForbiddenException);
  expect(tx.laboratory.update).not.toHaveBeenCalled();
});
it("does not modify missing or cross-organization laboratories", async () => {
  const { service, tx } = setup();
  tx.laboratory.findFirst.mockResolvedValue(null);
  await expect(
    service.saveLaboratoryLogo("actor", "other", "lab", null),
  ).rejects.toThrow(NotFoundException);
  expect(tx.laboratory.update).not.toHaveBeenCalled();
});
