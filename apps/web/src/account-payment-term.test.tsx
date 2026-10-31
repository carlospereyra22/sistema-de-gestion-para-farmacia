import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountPaymentTerm } from "./account-payment-term";

it("shows the no-due-date choice without an unnecessary days input", () => {
  const html = renderToStaticMarkup(
    <AccountPaymentTerm value="" onChange={() => {}} disabled={false} />,
  );
  expect(html).toContain("Sin vencimiento");
  expect(html).toContain("A plazo");
  expect(html).not.toContain('type="number"');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
});
it.each(["0", "30", "3650"])(
  "preserves the configured term %s with whole-day steps",
  (value) => {
    const html = renderToStaticMarkup(
      <AccountPaymentTerm value={value} onChange={() => {}} disabled={false} />,
    );
    expect(html).toContain(`value="${value}"`);
    expect(html).toContain('step="1"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="3650"');
    expect(html).toContain('required=""');
  },
);
it("disables the controls while saving", () => {
  const html = renderToStaticMarkup(
    <AccountPaymentTerm value="30" onChange={() => {}} disabled />,
  );
  expect(html).toContain('<fieldset disabled=""');
});
