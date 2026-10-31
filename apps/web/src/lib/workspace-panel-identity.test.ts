import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression guard: these are siblings. A shared organization/branch key let
// Cash replace Sales during reconciliation and lose the in-memory draft.
describe("workspace panel identity", () => {
  const source = readFileSync(
    new URL("../workspace-shell.tsx", import.meta.url),
    "utf8",
  );
  it("isolates catalog, price lists and organization siblings", () => {
    expect(source).toContain("key={`catalog-options:${organizationId}`}");
    expect(source).toContain("key={`price-lists:${organizationId}`}");
    expect(source).toContain("key={`organization:${organizationId}`}");
  });
  it.each([
    ["Sales", "sales"],
    ["Cash", "cash"],
    ["Inventory", "inventory"],
  ])(
    "namespaces %s independently of other sibling screens",
    (component, prefix) => {
      const openingTag = source.match(
        new RegExp(`<${component}\\s+key=\\{([^}]+(?:}[^}]+)*?)\\}\\s`),
      )?.[0];
      expect(openingTag).toBeDefined();
      expect(openingTag).toContain(`key={\`${prefix}:`);
    },
  );
  it("keeps visited sales mounted when navigating to another screen", () => {
    expect(source).toContain('ready && (view === "Ventas" || salesVisited)');
    expect(source).toContain('active={view === "Ventas"}');
    expect(source).toContain(
      "if (wasVisible.current && !posVisible && lines.length > 0)",
    );
    expect(source).toContain("setResumeNeeded(true)");
  });
  it("retains Caja within its scope instead of remounting on every navigation", () => {
    expect(source).toContain(
      'view === "Caja" || visitedCashScope === accountsScope',
    );
    expect(source).toContain('active={view === "Caja"}');
    expect(source).toContain(
      'className={active ? "cash-workspace" : "hidden"}',
    );
    expect(source).toContain("key={`cash:${organizationId}:${branchId}`}");
  });
  it("keeps the visited dashboard mounted and scopes it to the organization and branch", () => {
    expect(source).toContain('ready && (view === "Inicio" || homeVisited)');
    expect(source).toContain('hidden={view !== "Inicio"}');
    expect(source).toContain('active={view === "Inicio"}');
    expect(source).toContain("key={`home:${organizationId}:${branchId}`}");
  });
  it("does not remount notification state when the access token rotates", () => {
    expect(source).not.toContain(
      "key={`${organizationId}:${branchId}:${accessToken}`}",
    );
    expect(source).toContain("key={`${email}:${organizationId}:${branchId}`}");
  });
  it("resets navigation scroll before paint without reacting to token refresh", () => {
    expect(source).toContain('window.history.scrollRestoration = "manual"');
    expect(source).toContain(
      'window.scrollTo({ top: 0, left: 0, behavior: "instant" })',
    );
    expect(source).toContain(
      "[view, administrationTab, organizationTab, salesScreen]",
    );
  });
  it("retains recent rows and history during same-scope background updates", () => {
    const recent = readFileSync(
      new URL("../dashboard-recent-sales.tsx", import.meta.url),
      "utf8",
    );
    expect(recent).not.toContain("setSales(undefined)");
    expect(recent).toContain("snapshot?.scope === scope");
    expect(recent).toContain("if (!active) return");
    const history = readFileSync(
      new URL("../operation-history.tsx", import.meta.url),
      "utf8",
    );
    expect(history).toContain("if (initial) setRows([])");
    expect(history).toContain("loadedScope.current !== scope");
  });
});
