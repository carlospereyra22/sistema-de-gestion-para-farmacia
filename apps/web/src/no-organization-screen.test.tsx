import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NoOrganizationScreen } from "./no-organization-screen";

it("avisa que el usuario no tiene farmacia y deja salir", () => {
  const html = renderToStaticMarkup(
    <NoOrganizationScreen email="sin@example.com" onLogout={() => {}} />,
  );

  expect(html).toContain("Tu usuario no tiene farmacia");
  expect(html).toContain("sin@example.com");
  expect(html).toContain("Cerrar sesión");
});
