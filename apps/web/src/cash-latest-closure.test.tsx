import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CashLatestClosure } from "./cash-latest-closure";

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
