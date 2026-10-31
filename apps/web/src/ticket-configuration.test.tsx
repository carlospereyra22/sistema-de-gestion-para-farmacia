import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OrganizationTicketSettings } from "./organization-ticket-settings";
import { UserTicketNameDialog, UserTicketNameField } from "./user-ticket-names";
it("does not render personal example data in organization settings", () => {
  const html = renderToStaticMarkup(
    <OrganizationTicketSettings token="test" organizationId="org" />,
  );
  for (const value of ["Centenario", "24723783", "035705", "Posadas"])
    expect(html).not.toContain(value);
});
it("offers user name configuration without changing credentials", () => {
  const html = renderToStaticMarkup(
    <UserTicketNameDialog
      token="test"
      organizationId="org"
      user={{
        user: { id: "user", email: "user@example.test", active: true },
        displayName: "Carlo",
        active: true,
        roles: [],
        branches: [],
      }}
      onDone={() => {}}
      onClose={() => {}}
    />,
  );
  expect(html).toContain("Nombre<input");
  expect(html).toContain("Guardar nombre");
  expect(html).not.toContain('type="password"');
  expect(html).toContain('value="Carlo"');
  expect(html).toContain("user@example.test");
  expect(html).toContain("<dialog");
  expect(html).not.toContain("<select");
});
it("offers an optional blank name when creating a user", () => {
  const html = renderToStaticMarkup(
    <UserTicketNameField value="" onChange={() => {}} />,
  );
  expect(html).toContain("Nombre<input");
  expect(html).not.toContain("Nombre para el ticket");
  expect(html).not.toContain("Se muestra en");
  expect(html).toContain('value=""');
  expect(html).toContain('maxLength="120"');
  expect(html).not.toContain("required");
});
