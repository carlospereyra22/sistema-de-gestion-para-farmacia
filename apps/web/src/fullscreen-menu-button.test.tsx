import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FullscreenMenuButton } from "./fullscreen-menu-button";

it("offers an accessible fullscreen action with visible text, not just an icon", () => {
  const html = renderToStaticMarkup(
    <FullscreenMenuButton onDone={() => {}} onError={() => {}} />,
  );
  expect(html).toContain("<span>Pantalla completa</span>");
  expect(html).toContain('title="Usar en pantalla completa"');
  expect(html).toContain('type="button"');
  expect(html).toContain('aria-pressed="false"');
  expect(html).toContain('aria-hidden="true"');
});
