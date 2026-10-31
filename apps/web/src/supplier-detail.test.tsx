import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SupplierDetail } from "./supplier-detail";
import type { Party } from "./lib/api";
const render = (extra: Partial<Party> = {}) =>
  renderToStaticMarkup(
    <SupplierDetail
      supplier={{ id: "s1", name: "Ramona", active: true, ...extra }}
      onClose={() => undefined}
      onEdit={() => undefined}
    />,
  );
describe("supplier detail", () => {
  it("shows saved profile data and an edit footer without a popup", () => {
    const html = render({
      accountEnabled: true,
      accountTermDays: 15,
      contactName: "Ana",
      phone: "381123456",
      email: "ana@example.com",
      address: "Calle 123",
      notes: "Entrega martes",
    });
    for (const value of [
      "Ramona",
      "15 días",
      "Ana",
      "381123456",
      "ana@example.com",
      "Calle 123",
      "Entrega martes",
      "Editar proveedor",
      "Cerrar detalle del proveedor",
    ])
      expect(html).toContain(value);
    expect(html).toContain("mt-auto");
    expect(html).not.toContain("<dialog");
  });
  it("distinguishes immediate, undefined and disabled account terms", () => {
    expect(render({ accountEnabled: true, accountTermDays: 0 })).toContain(
      "Al recibir",
    );
    expect(render({ accountEnabled: true, accountTermDays: null })).toContain(
      "Sin plazo definido",
    );
    expect(render({ accountEnabled: false, accountTermDays: 15 })).toContain(
      "No aplica",
    );
    expect(render()).toContain("Sin teléfono");
  });
});
