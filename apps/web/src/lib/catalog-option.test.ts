import { afterEach, expect, it, vi } from "vitest";
import {
  createOrSelectCatalogOption,
  filterCatalogOptions,
  matchingCatalogOption,
} from "./catalog-option";

afterEach(() => vi.unstubAllGlobals());
it("reuses a child only under its selected parent and sends parentId for a new branch", async () => {
  const options = [{ id: "child", name: "Shampoo", parentId: "hair" }];
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ id: "new", name: "Shampoo", parentId: "other" }),
        { status: 201 },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  expect(
    await createOrSelectCatalogOption(
      "token",
      "org",
      "categories",
      "Shampoo",
      options,
      "hair",
    ),
  ).toEqual(options[0]);
  expect(fetch).not.toHaveBeenCalled();
  await createOrSelectCatalogOption(
    "token",
    "org",
    "categories",
    "Shampoo",
    options,
    "other",
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    name: "Shampoo",
    parentId: "other",
  });
  expect(
    matchingCatalogOption(
      [...options, { id: "other", name: "Shampoo", parentId: "another" }],
      "Shampoo",
    ),
  ).toBeUndefined();
});
const options = [
  { id: "a", name: "Genéricos" },
  { id: "b", name: "Laboratorio Beta" },
];
it("searches names ignoring accents, case and word order", () => {
  expect(filterCatalogOptions(options, "GENERICO")).toEqual([options[0]]);
  expect(filterCatalogOptions(options, "beta labo")).toEqual([options[1]]);
  expect(filterCatalogOptions(options, "missing")).toEqual([]);
});
it("selects a known equivalent name without posting a duplicate", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(matchingCatalogOption(options, " laboratorio   BETA ")).toEqual(
    options[1],
  );
  await expect(
    createOrSelectCatalogOption(
      "token",
      "org",
      "laboratories",
      " laboratorio  BETA ",
      options,
    ),
  ).resolves.toEqual(options[1]);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["categories", "laboratories"] as const)(
  "creates %s in the current organization and returns the persisted selection",
  async (type) => {
    const created = { id: "new-id", name: "Nombre nuevo" };
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(created), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      createOrSelectCatalogOption(
        "fixture",
        "org-a",
        type,
        "  Nombre   nuevo ",
        options,
      ),
    ).resolves.toEqual(created);
    const [url, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/organizations/org-a/catalog/${type}`);
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({ Authorization: "Bearer fixture" });
    expect(JSON.parse(request.body as string)).toEqual({
      name: "Nombre nuevo",
      ...(type === "categories" ? { parentId: null } : {}),
    });
  },
);
it.each(["", "  ", "a", "a".repeat(121)])(
  "rejects invalid name %s without a request",
  async (name) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      createOrSelectCatalogOption("fixture", "org", "categories", name, []),
    ).rejects.toThrow("entre 2 y 120");
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("propagates permission errors and does not invent an ID", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "No tenés permiso" }), {
        status: 403,
      }),
    ),
  );
  await expect(
    createOrSelectCatalogOption("fixture", "org", "categories", "Nueva", []),
  ).rejects.toThrow("No tenés permiso");
});
