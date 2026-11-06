import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CashLatestClosure } from "./cash-latest-closure";

it("no vacía los datos al volver a consultar, para que no parpadeen", () => {
  const source = readFileSync(
    new URL("./cash-latest-closure.tsx", import.meta.url),
    "utf8",
  );
  expect(source).not.toContain("setResult(undefined)");
  expect(
    readFileSync(new URL("./cash-workspace.tsx", import.meta.url), "utf8"),
  ).not.toContain("setRecent({ registerId });");
});

it("loads the selected register closure without inventing dates or balances", () => {
  const html = renderToStaticMarkup(
    <CashLatestClosure
      token="test"
      organizationId="org"
      branchId="branch"
      registerId="register"
      refreshKey={0}
      onView={() => undefined}
    />,
  );
  expect(html).toContain("Último cierre");
  expect(html).toContain("Consultando último cierre");
  expect(html).not.toContain("NaN");
  expect(html).not.toContain("Contado:");
});
