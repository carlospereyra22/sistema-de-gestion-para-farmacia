import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps account history pagination outside the scrolling rows and scopes the page by customer and filter", () => {
  const source = readFileSync(
    new URL("./customer-accounts.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain(
    "${organizationId}:${branchId}:${selectedId}:${historyFilter}",
  );
  expect(source).toContain("historyPageRows.map");
  expect(source).toContain('label="Páginas del historial de cuenta corriente"');
  expect(source).toContain(
    "account-history-panel flex min-h-0 flex-1 flex-col",
  );
});

it("anchors collection, due and history footers to the bottom of their panels", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  expect(css).toContain(".account-sale-selection > .pagination-footer");
  expect(css).toContain(".account-history-panel > .pagination-footer");
  expect(css).toContain(".account-customer-due .pagination-footer");
  expect(css).toContain("margin-top: auto");
  expect(css).toMatch(
    /\.account-customer-detail\[data-collecting="true"\] \.account-collection-footer\s*\{\s*margin-top: auto;/,
  );
});

it("stretches the customer due layout despite the original items-start utility", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const rule = css.slice(css.indexOf("  .account-customer-due,"));
  expect(rule.slice(0, rule.indexOf("}"))).toContain("align-items: stretch;");
  expect(rule.slice(0, rule.indexOf("}"))).toContain("width: 100%;");
});

it("keeps receipt and detail buttons in a compact actions column", () => {
  const source = readFileSync(
    new URL("./customer-accounts.tsx", import.meta.url),
    "utf8",
  );
  const history = source.slice(
    source.indexOf("{historyPageRows.map"),
    source.indexOf("{selected.movements.length > 0"),
  );
  expect(history).toContain(
    'className="px-3 py-2 text-right whitespace-nowrap"',
  );
  expect(history).toContain("colSpan={5}");
  const actions = history.slice(
    history.indexOf('className="px-3 py-2 text-right whitespace-nowrap"'),
  );
  expect(actions).toContain("printReceipt(movement.id)");
  expect(actions).toContain('"Ver detalle"');
  expect(actions).not.toContain('className="mt-2 inline-flex');
});
