import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { BranchProductDialog } from "./branch-product-dialog";
import {
  changeBranchProduct,
  deleteUnusedCatalogProduct,
  getCatalogProducts,
  type CatalogProduct,
} from "./lib/api";
vi.mock("react-dom", () => ({ createPortal: (children: unknown) => children }));
afterEach(() => {
  vi.unstubAllGlobals();
});
const product = {
  id: "product",
  name: "Actron",
  active: false,
  branchStatus: "ARCHIVED",
} as CatalogProduct;
it("names the branch, preserved history and explicit stock write-off with a disabled initial confirmation", () => {
  vi.stubGlobal("document", { body: {} });
  const html = renderToStaticMarkup(
    <BranchProductDialog
      token="token"
      organizationId="org"
      branchId="branch"
      branchName="Juncos"
      product={product}
      status="DELETED"
      stock={4}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
  expect(html).toContain("Sólo en Juncos");
  expect(html).toContain("m-auto");
  expect(html).toContain("max-h-[90dvh]");
  expect(html).toContain("overflow-y-auto");
  expect(html).toContain("ventas, comprobantes y movimientos históricos");
  expect(html).toContain("Confirmo la baja de estas existencias.");
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('maxLength="300"');
  expect(html).toContain('disabled=""');
  expect(html).not.toContain("Eliminar definitivamente");
});
it("archive preserves stock and does not request a stock write-off", () => {
  vi.stubGlobal("document", { body: {} });
  const html = renderToStaticMarkup(
    <BranchProductDialog
      token="token"
      organizationId="org"
      branchId="branch"
      branchName="Juncos"
      product={product}
      status="ARCHIVED"
      stock={4}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
  expect(html).toContain("Conserva el stock");
  expect(html).not.toContain('type="checkbox"');
});
it("warns that permanent deletion is organization-wide, requires no history, and never offers a stock write-off", async () => {
  vi.stubGlobal("document", { body: {} });
  const html = renderToStaticMarkup(
    <BranchProductDialog
      token="token"
      organizationId="org"
      branchId="branch"
      branchName="Juncos"
      product={product}
      status="PURGE"
      stock={0}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
  expect(html).toContain("Eliminar definitivamente");
  expect(html).toContain("catálogo compartido de la organización");
  expect(html).toContain("en ninguna sucursal");
  expect(html).not.toContain("Sólo en Juncos");
  expect(html).not.toContain('type="checkbox"');
  expect(html).not.toContain("Stock a dar de baja");
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  await deleteUnusedCatalogProduct("token", "org", "product");
  expect(fetch.mock.calls[0]?.[0]).toContain(
    "/organizations/org/catalog/products/product",
  );
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
});
it("reads and changes only the requested branch and sends expected state and explicit confirmation", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", fetch);
  await getCatalogProducts("token", "org", "branch");
  expect(fetch.mock.calls[0]?.[0]).toContain(
    "catalog/products?branchId=branch",
  );
  const input = {
    status: "DELETED" as const,
    expectedStatus: "ARCHIVED" as const,
    reason: "Fuera de catálogo",
    expectedStock: 4,
    confirmStockWriteOff: true,
  };
  await changeBranchProduct("token", "org", "branch", "product", input);
  expect(fetch.mock.calls[1]?.[0]).toContain(
    "catalog/branches/branch/products/product/state",
  );
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({
    method: "PATCH",
    body: JSON.stringify(input),
  });
});
