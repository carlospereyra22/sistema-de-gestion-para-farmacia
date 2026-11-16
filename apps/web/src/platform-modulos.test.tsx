import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlatformModulos } from "./platform-modulos";

describe("módulos de una farmacia en el panel de plataforma", () => {
  const props = {
    token: "t",
    organizationId: "o",
    onChanged: () => undefined,
    onError: () => undefined,
  };

  it("muestra el catálogo online como un switch con su estado", () => {
    const apagado = renderToStaticMarkup(
      <PlatformModulos {...props} catalogEnabled={false} />,
    );
    expect(apagado).toContain("Catálogo online");
    expect(apagado).toContain('role="switch"');
    expect(apagado).toContain('aria-checked="false"');
    expect(
      renderToStaticMarkup(<PlatformModulos {...props} catalogEnabled />),
    ).toContain('aria-checked="true"');
  });
});
