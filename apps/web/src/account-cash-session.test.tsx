import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountCashSession } from "./account-cash-session";
const session = { id: "one", openedAt: "2026-10-11T12:00:00Z" };
it("hides the selector when there is only one open session", () => {
  expect(
    renderToStaticMarkup(
      <AccountCashSession
        sessions={[session]}
        value="one"
        onChange={() => {}}
      />,
    ),
  ).toBe("");
});
it("warns when no cash session is open", () => {
  const html = renderToStaticMarkup(
    <AccountCashSession sessions={[]} value="" onChange={() => {}} />,
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain("No hay una caja abierta");
  expect(html).not.toContain("<select");
});
it("keeps the choice when multiple sessions are open", () => {
  const html = renderToStaticMarkup(
    <AccountCashSession
      sessions={[session, { ...session, id: "two" }]}
      value="one"
      onChange={() => {}}
    />,
  );
  expect(html).toContain("<select");
  expect(html).toContain('value="two"');
});
