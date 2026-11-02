import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_DOCUMENT_ACCENT,
  DocumentTemplateDto,
  readDocumentTemplate,
} from "./document-template";
import { OrganizationsService } from "./organizations.service";

const valid = (input: object) =>
  validateSync(plainToInstance(DocumentTemplateDto, input)).length === 0;

describe("document template", () => {
  it("accepts a hex accent and a multi-line footer", () => {
    expect(
      valid({
        accentColor: " #0F9B8E ",
        footerText: "Gracias por tu compra\r\nWhatsApp 376 400-0000",
      }),
    ).toBe(true);
    expect(
      plainToInstance(DocumentTemplateDto, {
        accentColor: "#0F9B8E",
        footerText: "a\r\nb",
      }),
    ).toMatchObject({ accentColor: "#0f9b8e", footerText: "a\nb" });
  });
  it.each([
    { accentColor: "teal", footerText: "" },
    { accentColor: "#12345", footerText: "" },
    { accentColor: "#087f70", footerText: "x".repeat(601) },
    { accentColor: "#087f70", footerText: "tab\there" },
    { accentColor: "#087f70" },
  ])("rejects %j", (input) => {
    expect(valid(input)).toBe(false);
  });
  it("falls back to defaults for missing or corrupt saved data", () => {
    expect(readDocumentTemplate(null)).toEqual({
      accentColor: DEFAULT_DOCUMENT_ACCENT,
      footerText: "",
    });
    expect(readDocumentTemplate({ accentColor: "red", footerText: 4 })).toEqual(
      { accentColor: DEFAULT_DOCUMENT_ACCENT, footerText: "" },
    );
    expect(
      readDocumentTemplate({ accentColor: "#AB12CD", footerText: " Pie " }),
    ).toEqual({ accentColor: "#ab12cd", footerText: "Pie" });
  });
});

const membership = (codes: string[]) => ({
  active: true,
  roles: [
    {
      role: { permissions: codes.map((code) => ({ permission: { code } })) },
    },
  ],
});

describe("document template service", () => {
  it("lets sellers read the template and logo to print", async () => {
    const service = new OrganizationsService({
      userOrganization: {
        findUnique: jest.fn().mockResolvedValue(membership(["SALE_READ"])),
      },
      organization: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          documentTemplate: { accentColor: "#123456", footerText: "Pie" },
          documentLogo: new Uint8Array([0xff, 0xd8]),
          documentLogoUpdatedAt: new Date("2026-11-02T00:00:00Z"),
        }),
      },
    } as unknown as PrismaService);
    await expect(service.documentTemplate("actor", "org")).resolves.toEqual({
      accentColor: "#123456",
      footerText: "Pie",
      logo: "data:image/jpeg;base64,/9g=",
      logoUpdatedAt: new Date("2026-11-02T00:00:00Z"),
    });
  });

  it("updates only with ORGANIZATION_MANAGE and audits in the same transaction", async () => {
    const update = jest.fn().mockResolvedValue({});
    const audit = jest.fn().mockResolvedValue({});
    const member = jest
      .fn()
      .mockResolvedValue(membership(["ORGANIZATION_MANAGE"]));
    const transaction = jest.fn(async (fn: (tx: object) => Promise<unknown>) =>
      fn({ organization: { update }, auditLog: { create: audit } }),
    );
    const service = new OrganizationsService({
      userOrganization: { findUnique: member },
      $transaction: transaction,
    } as unknown as PrismaService);
    const template = { accentColor: "#0f9b8e", footerText: "Pie" };
    await service.updateDocumentTemplate("actor", "org", template);
    expect(update).toHaveBeenCalledWith({
      where: { id: "org" },
      data: { documentTemplate: template },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DOCUMENT_TEMPLATE_UPDATED",
          organizationId: "org",
        }),
      }),
    );
    member.mockResolvedValue(membership(["SALE_READ"]));
    await expect(
      service.updateDocumentTemplate("actor", "org", template),
    ).rejects.toThrow();
    await expect(
      service.saveDocumentLogo("actor", "org", null),
    ).rejects.toThrow();
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("removes the logo and audits the removal", async () => {
    const update = jest.fn().mockResolvedValue({ documentLogoUpdatedAt: null });
    const audit = jest.fn().mockResolvedValue({});
    const service = new OrganizationsService({
      userOrganization: {
        findUnique: jest
          .fn()
          .mockResolvedValue(membership(["ORGANIZATION_MANAGE"])),
      },
      $transaction: jest.fn(async (fn: (tx: object) => Promise<unknown>) =>
        fn({ organization: { update }, auditLog: { create: audit } }),
      ),
    } as unknown as PrismaService);
    await expect(
      service.saveDocumentLogo("actor", "org", null),
    ).resolves.toEqual({ logoUpdatedAt: null });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { documentLogo: null, documentLogoUpdatedAt: null },
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DOCUMENT_LOGO_REMOVED" }),
      }),
    );
  });

  it("rejects a logo that is not a valid JPEG before writing", async () => {
    const transaction = jest.fn();
    const service = new OrganizationsService({
      userOrganization: {
        findUnique: jest
          .fn()
          .mockResolvedValue(membership(["ORGANIZATION_MANAGE"])),
      },
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(
      service.saveDocumentLogo("actor", "org", "data:image/png;base64,AAAA"),
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});
