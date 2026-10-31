import { ExternalCatalogController } from "./external-catalog.controller";
import type { CatalogService } from "./catalog.service";
import type { ExternalCatalogService } from "./external-catalog.service";
import type { AuthenticatedRequest } from "../auth/auth.types";
it.each([
  ["presentaciones_contradictorias", true],
  ["presentaciones_contradictorias; marcas_contradictorias", false],
  ["tipo_capilar_contradictorio", false],
])(
  "handles category independently of package-size warning: %s",
  async (review_reason, expected) => {
    const resolveExternalCategory = jest
      .fn()
      .mockResolvedValue({ categoryId: "solar", created: 0 });
    const categoryEvidence = jest.fn().mockResolvedValue([]);
    const controller = new ExternalCatalogController(
      {
        assertPermission: jest.fn(),
        resolveExternalCategory,
      } as unknown as CatalogService,
      {
        categoryEvidence,
        lookup: jest.fn().mockResolvedValue({
          reference: [
            {
              fingerprint: "av",
              source: "public_farmalife",
              category_path: ["Dermo", "Protector Solar"],
              scope_group: "Protección solar",
              review_reason,
            },
          ],
          openBeauty: { candidates: [] },
        }),
      } as unknown as ExternalCatalogService,
    );
    await controller.category(
      { auth: { sub: "actor" } } as AuthenticatedRequest,
      "org",
      "7793742005527",
      { fingerprint: "av", source: "public_farmalife" },
    );
    expect(resolveExternalCategory).toHaveBeenCalledTimes(1);
    expect(categoryEvidence).toHaveBeenCalledTimes(expected ? 0 : 1);
  },
);

it("requires the organization's catalog permission before consulting the external database", async () => {
  const assertPermission = jest.fn().mockRejectedValue(new Error("Forbidden"));
  const lookup = jest.fn();
  const controller = new ExternalCatalogController(
    { assertPermission } as unknown as CatalogService,
    { lookup } as unknown as ExternalCatalogService,
  );
  const request = { auth: { sub: "actor" } } as AuthenticatedRequest;
  await expect(
    controller.lookup(request, "org", "7500435211895"),
  ).rejects.toThrow("Forbidden");
  expect(assertPermission).toHaveBeenCalledWith(
    "actor",
    "org",
    "CATALOG_MANAGE",
  );
  expect(lookup).not.toHaveBeenCalled();
});

it("resolves only a current candidate's server-side path, never a client-supplied category", async () => {
  const resolveExternalCategory = jest
    .fn()
    .mockResolvedValue({ categoryId: "child", created: 1 });
  const lookup = jest.fn().mockResolvedValue({
    reference: [
      {
        fingerprint: "hash",
        source: "farmar",
        category_path: ["Capilar", "Shampoo"],
        scope_group: "Cabello",
      },
    ],
    openBeauty: { candidates: [] },
  });
  const controller = new ExternalCatalogController(
    {
      assertPermission: jest.fn(),
      resolveExternalCategory,
    } as unknown as CatalogService,
    { lookup } as unknown as ExternalCatalogService,
  );
  const request = { auth: { sub: "actor" } } as AuthenticatedRequest;
  await controller.category(request, "org", "7791274201653", {
    fingerprint: "hash",
    source: "farmar",
  });
  expect(resolveExternalCategory).toHaveBeenCalledWith(
    "actor",
    "org",
    ["Capilar", "Shampoo"],
    "Cabello",
    {
      name: undefined,
      subcategory: undefined,
      review_reason: undefined,
      evidence: undefined,
    },
  );
  await expect(
    controller.category(request, "org", "7791274201653", {
      fingerprint: "stale",
      source: "farmar",
    }),
  ).rejects.toThrow("La ficha cambió");
  expect(resolveExternalCategory).toHaveBeenCalledTimes(1);
});
