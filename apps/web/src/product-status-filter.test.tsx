import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProductStatusFilter } from "./product-status-filter";

it.each([false, true])(
  "keeps both states visible and marks the selected filter (%s)",
  (archived) => {
    const html = renderToStaticMarkup(
      <ProductStatusFilter archived={archived} onChange={() => {}} />,
    );
    expect(html).toContain('aria-label="Estado de productos"');
    expect(html).toContain("Activos");
    expect(html).toContain("Archivados");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(
      archived
        ? /aria-pressed="true"[^>]*>Archivados/
        : /aria-pressed="true"[^>]*>Activos/,
    );
    expect(html).not.toContain("<select");
  },
);
