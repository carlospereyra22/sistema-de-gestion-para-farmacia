import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountMenu } from "./account-menu";

it("places sales controls in the global header and reclaims the heading height", () => {
  const source = readFileSync(
    new URL("./workspace-shell.tsx", import.meta.url),
    "utf8",
  );
  const header = source.slice(
    source.indexOf("<header"),
    source.indexOf("</header>"),
  );
  expect(header).toContain("workspace-sales-title");
  expect(header).toContain("<ShoppingCart");
  expect(header).toContain("<LayoutDashboard");
  expect(header).toContain("<Boxes");
  expect(header).toContain("<DistributionWorkspace");
  expect(header).toContain("<OperationHistory");
  expect(header).toContain('view === "Inicio"');
  expect(source).not.toContain("Inicio / Dashboard");
  expect(header).toContain('setSalesScreen("history")');
  expect(header).toContain("branchSelector={branchSelector}");
  expect(source.match(/branchSelector=\{branchSelector\}/g)).toHaveLength(1);
  expect(source).not.toContain("{branchSelector}</");
  expect(source).toMatch(
    /view !== "Ventas"\s*&&\s*view !== "Listas de precios"\s*&&\s*view !== "Caja"\s*&&\s*view !== "Cuentas corrientes"/,
  );
  expect(header).toContain("setAccountToolbarTarget");
  expect(header).toContain("<NotebookTabs");
  expect(header).toContain("setCashToolbarTarget");
  expect(header).toContain("<CashRegisterIcon");
  expect(source).toContain("toolbarTarget={cashToolbarTarget}");
  expect(source.match(/<AccountBranchSelector/g)).toHaveLength(1);
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  expect(css).toContain("max(620px, calc(100dvh - 106px))");
  expect(css).toContain("max(480px, calc(100dvh - 72px))");
});

it("keeps the compact account control named and keyboard-accessible", () => {
  const html = renderToStaticMarkup(
    <AccountMenu
      email="caja@example.test"
      organizationName="Farmacia"
      branchName="Central"
      onLogout={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Cuenta de Farmacia"');
  expect(html).toContain('title="Cuenta de Farmacia · Central"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("workspace-account-label");
});

it("scopes compact header and sales layout below desktop width without zoom", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const compact = css.slice(
    css.indexOf("/* Compact workspace"),
    css.indexOf("@keyframes notification-slide-in"),
  );
  expect(compact).toContain("(min-width: 1024px) and (max-width: 1799px)");
  expect(compact).toContain(".workspace-account-panel");
  expect(compact).toContain(".workspace-page-actions > button");
  expect(compact).toContain(".workspace-page-actions > select");
  expect(compact).toContain(".workspace-reference-action");
  expect(compact).toContain("min-height: 36px");
  expect(compact).toContain("flex-wrap: wrap");
  expect(compact).toContain("width: 208px");
  expect(compact).toMatch(/minmax\(\s*330px,\s*1fr\s*\)/);
  expect(compact).not.toMatch(/\bzoom\s*:/);
  expect(css).toContain("(min-width: 1024px) and (max-width: 1199px)");
  expect(css).toContain("grid-column: 1 / -1");
});

it("defaults to compact at 1606px and expanded at 1920px, with tooltips following manual state", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const rail = readFileSync(
    new URL("./navigation-rail.tsx", import.meta.url),
    "utf8",
  );
  expect(css).not.toContain("1599px");
  expect(css).not.toContain("1600px");
  expect(css).toContain("(min-width: 1800px)");
  const sidebar = readFileSync(
    new URL("./use-workspace-sidebar.ts", import.meta.url),
    "utf8",
  );
  const minimum = Number(sidebar.match(/min-width: (\d+)px/)?.[1]);
  expect(1606).toBeLessThan(minimum);
  expect(1920).toBeGreaterThanOrEqual(minimum);
  expect(rail).toContain("if (!collapsed) return;");
  expect(css).toContain('.workspace-layout[data-sidebar="collapsed"]');
});

it("compacts only checkout by height without removing overflow or hiding payment fields", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const block = css.slice(
    css.indexOf("/* Checkout density"),
    css.indexOf(".notification-slide-in {"),
  );
  expect(block).toContain("(min-width: 1200px) and (max-height: 950px)");
  expect(block).toContain(".sales-layout > .sales-checkout > footer > button");
  expect(block).toContain("min-height: 44px");
  expect(block).not.toMatch(/display:\s*none|overflow:\s*hidden|font-size:/);
  expect(block).not.toContain(".workspace-header");
});
