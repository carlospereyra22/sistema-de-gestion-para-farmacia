import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountCustomerContact } from "./account-customer-contact";
import { whatsappLink } from "./lib/whatsapp-link";
import type { CustomerAccount } from "./lib/api";
it("opens only explicit international phone numbers without guessing a country", () => {
  expect(whatsappLink("+54 9 11 1234-5678")).toBe(
    "https://wa.me/5491112345678",
  );
  expect(whatsappLink("1112345678")).toBeNull();
  expect(whatsappLink("+javascript:alert(1)")).toBeNull();
  expect(whatsappLink(null)).toBeNull();
});
it("shows missing contact information without an actionable WhatsApp link", () => {
  const html = renderToStaticMarkup(<AccountCustomerContact />);
  expect(html).toContain("Sin informar");
  expect(html).not.toContain("href=");
});

const account: CustomerAccount = {
  id: "abel",
  name: "Abel",
  active: true,
  creditEnabled: true,
  creditLimitMinor: null,
  balanceMinor: "10000",
  movements: [],
  document: "27-34567890-1",
  billingPhone: "+54 9 3765 123456",
};
it("shows a titled contact card, real document and separate telephone/WhatsApp fields", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerContact account={account} />,
  );
  expect(html).toContain("Datos del cliente");
  expect(html).toContain("CUIT / DNI");
  expect(html).toContain("27-34567890-1");
  expect(html).toContain("Teléfono");
  expect(html).toContain('href="https://wa.me/5493765123456"');
  expect(html).toContain("Crédito habilitado");
});
it("does not enable credit or a WhatsApp link for inactive customers or local-only phones", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerContact
      account={{ ...account, active: false, billingPhone: "3765123456" }}
    />,
  );
  expect(html).toContain("Crédito deshabilitado");
  expect(html).not.toContain("href=");
  expect(html).toContain("3765123456");
});
