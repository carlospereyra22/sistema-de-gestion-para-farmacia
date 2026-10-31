import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NavigationRail } from "./navigation-rail";

it("keeps navigation labels accessible without duplicate native tooltips", () => {
  const html = renderToStaticMarkup(
    <NavigationRail className="workspace-navigation">
      <nav aria-label="Operación">
        <button aria-label="Ventas">
          <span>Carrito</span>
          <span>Ventas</span>
        </button>
      </nav>
    </NavigationRail>,
  );
  expect(html).toContain('aria-label="Ventas"');
  expect(html).toContain('aria-label="Operación"');
  expect(html).not.toContain("title=");
  expect(html).not.toContain('role="tooltip"');
});
