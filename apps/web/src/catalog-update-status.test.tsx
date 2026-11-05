import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CatalogUpdateStatusView } from "./catalog-update-status";

it("muestra la última revisión de la base en hora de Argentina y sin botón", () => {
  const html = renderToStaticMarkup(
    <CatalogUpdateStatusView
      status={{ items: 17848, lastCheckedAt: "2026-11-05T13:33:44.000Z" }}
    />,
  );
  expect(html).toContain("Última actualización");
  expect(html).toContain("05/11/2026");
  expect(html).toContain("10:33");
  expect(html).toContain("Base de medicamentos");
  expect(html).toContain("17.848 medicamentos en la base");
  expect(html).toContain("no implica que");
  expect(html).not.toContain("<button");
});

it("no inventa una fecha si la base nunca se revisó o todavía no respondió", () => {
  for (const status of [undefined, { items: 0, lastCheckedAt: null }]) {
    const html = renderToStaticMarkup(
      <CatalogUpdateStatusView status={status} />,
    );
    expect(html).toContain("Sin registro");
    expect(html).toContain("Sin revisión registrada");
  }
});
