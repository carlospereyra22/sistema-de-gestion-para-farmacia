import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SidebarToggle } from "./sidebar-toggle";

it.each([true, false])(
  "exposes the sidebar state and accessible toggle when expanded=%s",
  (expanded) => {
    const html = renderToStaticMarkup(
      <SidebarToggle expanded={expanded} onToggle={() => undefined} />,
    );
    expect(html).toContain(`aria-expanded="${expanded}"`);
    expect(html).toContain('aria-controls="workspace-navigation"');
    expect(html).toContain(
      expanded ? "Contraer barra lateral" : "Expandir barra lateral",
    );
  },
);
