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
it("muestra datos faltantes sin un enlace de WhatsApp", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerContact
      account={{ ...account, document: null, billingPhone: null }}
    />,
  );
  expect(html).toContain("Sin informar");
  expect(html).not.toContain("href=");
});
it("muestra documento, teléfono y WhatsApp en línea, sin repetir el estado del crédito", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerContact account={account} />,
  );
  expect(html).toContain('aria-label="Datos del cliente"');
  expect(html).toContain("CUIT / DNI");
  expect(html).toContain("27-34567890-1");
  expect(html).toContain("Teléfono");
  expect(html).toContain('href="https://wa.me/5493765123456"');
  expect(html).not.toContain("Crédito");
});
it("no ofrece WhatsApp con teléfonos sin código de país", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerContact
      account={{ ...account, billingPhone: "3765123456" }}
    />,
  );
  expect(html).not.toContain("href=");
  expect(html).toContain("3765123456");
  expect(html).toContain("WhatsApp no disponible");
});
