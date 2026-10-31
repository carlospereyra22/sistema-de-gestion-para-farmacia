import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OrganizationLogo } from "./organization-logo";
import { logoPreview } from "./lib/ticket-logo";

it("uses the same default image as organization settings while loading", () => {
  const html = renderToStaticMarkup(<OrganizationLogo revision={0} />);
  expect(html).toContain(`src="${logoPreview()}"`);
  expect(html).toContain('alt="Logo de la organización"');
  expect(html).toContain("object-contain");
});
