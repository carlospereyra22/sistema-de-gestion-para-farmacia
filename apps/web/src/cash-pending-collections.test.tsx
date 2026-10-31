import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CashPendingCollections } from "./cash-pending-collections";

it("uses a floating searchable destination in one dialog, retaining the draft while refreshing", () => {
  const source = readFileSync(
    new URL("./cash-pending-collections.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain("Asignar caja…");
  expect(source.match(/<CashDialog\b/g)).toHaveLength(1);
  expect(source).toContain("floatingOptions");
  expect(source).toContain("loading && !loaded");
  expect(source).toContain("SearchableSaleSelect");
  expect(source).not.toContain("inlineOptions");
});

it("keeps the closure actions column compact and right aligned with a centered title", () => {
  const source = readFileSync(
    new URL("./workspace-shell.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain("w-px whitespace-nowrap px-2 py-3 text-center");
  expect(source).toContain(
    "flex items-center justify-end gap-2 whitespace-nowrap",
  );
});

it("keeps pending collections behind an always-available options menu, even without a session", () => {
  const html = renderToStaticMarkup(
    <CashPendingCollections
      token="test"
      organizationId="org"
      branchId="branch"
      registers={[]}
      canManage
      active
      onAssigned={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Opciones de caja"');
  expect(html).toContain("Cobros pendientes de caja");
  expect(html).not.toContain("<table");
  expect(html).not.toContain("<dialog");
  expect(html).not.toContain("Abrí una caja");
});
