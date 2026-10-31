import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountMixedPayment } from "./account-mixed-payment";
it("keeps completed and empty totals accessible without a visible status box", () => {
  for (const total of [0, 1000000]) {
    const html = renderToStaticMarkup(
      <AccountMixedPayment
        total={total}
        value={{ CASH: total ? "10000" : "", CARD: "", TRANSFER: "" }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('role="status" class="sr-only"');
    expect(html).not.toContain("Falta completar");
  }
});
it("shows compact missing or excess amount messages", () => {
  const render = (cash: string) =>
    renderToStaticMarkup(
      <AccountMixedPayment
        total={1000000}
        value={{ CASH: cash, CARD: "", TRANSFER: "" }}
        onChange={() => {}}
      />,
    );
  expect(render("5000")).toContain("Falta completar");
  expect(render("11000")).toContain("Excede el total");
  expect(render("11000")).not.toContain("bg-rose-50");
});
