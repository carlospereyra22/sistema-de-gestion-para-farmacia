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
    { accentColor: "#087f70", footerText: "", defaultFormat: "PDF" },
  ])("rejects %j", (input) => {
    expect(valid(input)).toBe(false);
  });
  it("accepts partial updates from each screen", () => {
    expect(valid({ defaultFormat: "A4" })).toBe(true);
    expect(valid({ accentColor: "#087f70" })).toBe(true);
    expect(valid({})).toBe(true);
  });
  it("accepts ticket or A4 as the default print format", () => {
    for (const defaultFormat of ["TICKET", "A4"])
      expect(
        valid({ accentColor: "#087f70", footerText: "", defaultFormat }),
      ).toBe(true);
  });
  it("falls back to defaults for missing or corrupt saved data", () => {
    // Sin configurar se conserva el ticket térmico.
    expect(readDocumentTemplate(null)).toEqual({
      accentColor: DEFAULT_DOCUMENT_ACCENT,
      footerText: "",
      defaultFormat: "TICKET",
    });
    expect(
      readDocumentTemplate({
        accentColor: "red",
        footerText: 4,
        defaultFormat: "PDF",
      }),
    ).toEqual({
      accentColor: DEFAULT_DOCUMENT_ACCENT,
      footerText: "",
      defaultFormat: "TICKET",
    });
    expect(
      readDocumentTemplate({
        accentColor: "#AB12CD",
        footerText: " Pie ",
        defaultFormat: "A4",
      }),
    ).toEqual({
      accentColor: "#ab12cd",
      footerText: "Pie",
      defaultFormat: "A4",
    });
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
      defaultFormat: "TICKET",
      branchFormat: null,
      effectiveFormat: "TICKET",
      logo: "data:image/jpeg;base64,/9g=",
      logoUpdatedAt: new Date("2026-11-02T00:00:00Z"),
    });
  });

  it("uses the branch format over the organization default", async () => {
    const findBranch = jest.fn().mockResolvedValue({ printFormat: "A4" });
    const service = new OrganizationsService({
      userOrganization: {
        findUnique: jest.fn().mockResolvedValue(membership(["SALE_READ"])),
      },
      organization: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          documentTemplate: { defaultFormat: "TICKET" },
          documentLogo: null,
          documentLogoUpdatedAt: null,
        }),
      },
      branch: { findFirst: findBranch },
    } as unknown as PrismaService);
    await expect(
      service.documentTemplate("actor", "org", "branch"),
    ).resolves.toMatchObject({
      defaultFormat: "TICKET",
      branchFormat: "A4",
      effectiveFormat: "A4",
    });
    // Sólo sucursales de la misma organización.
    expect(findBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "branch", organizationId: "org", deletedAt: null },
      }),
    );
    findBranch.mockResolvedValue({ printFormat: null });
    await expect(
      service.documentTemplate("actor", "org", "branch"),
    ).resolves.toMatchObject({ branchFormat: null, effectiveFormat: "TICKET" });
    findBranch.mockResolvedValue(null);
    await expect(
      service.documentTemplate("actor", "org", "other-org-branch"),
    ).rejects.toThrow("La sucursal no está disponible.");
  });

  it("saves a branch format with ORGANIZATION_MANAGE and audits it", async () => {
    const update = jest.fn().mockResolvedValue({});
    const audit = jest.fn().mockResolvedValue({});
    const member = jest
      .fn()
      .mockResolvedValue(membership(["ORGANIZATION_MANAGE"]));
    const service = new OrganizationsService({
      userOrganization: { findUnique: member },
      $transaction: jest.fn(async (fn: (tx: object) => Promise<unknown>) =>
        fn({
          branch: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ id: "branch", printFormat: null }),
            update,
          },
          auditLog: { create: audit },
        }),
      ),
    } as unknown as PrismaService);
    await expect(
      service.updateBranchPrintFormat("actor", "org", "branch", "A4"),
    ).resolves.toEqual({ branchId: "branch", printFormat: "A4" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "branch" },
      data: { printFormat: "A4" },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "BRANCH_PRINT_FORMAT_UPDATED",
          branchId: "branch",
          before: { printFormat: null },
          after: { printFormat: "A4" },
        }),
      }),
    );
    member.mockResolvedValue(membership(["SALE_READ"]));
    await expect(
      service.updateBranchPrintFormat("actor", "org", "branch", null),
    ).rejects.toThrow();
  });

  it("updates only with ORGANIZATION_MANAGE and audits in the same transaction", async () => {
    const update = jest.fn().mockResolvedValue({});
    const audit = jest.fn().mockResolvedValue({});
    const member = jest
      .fn()
      .mockResolvedValue(membership(["ORGANIZATION_MANAGE"]));
    const lock = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn(async (fn: (tx: object) => Promise<unknown>) =>
      fn({
        $queryRaw: lock,
        organization: {
          update,
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            documentTemplate: {
              accentColor: "#123456",
              footerText: "Pie guardado",
              defaultFormat: "TICKET",
            },
          }),
        },
        auditLog: { create: audit },
      }),
    );
    const service = new OrganizationsService({
      userOrganization: { findUnique: member },
      $transaction: transaction,
    } as unknown as PrismaService);
    // Sólo cambia el formato: color y pie guardados se conservan.
    const template = { defaultFormat: "A4" as const };
    await service.updateDocumentTemplate("actor", "org", template);
    expect(lock).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "org" },
      data: {
        documentTemplate: {
          accentColor: "#123456",
          footerText: "Pie guardado",
          defaultFormat: "A4",
        },
      },
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
