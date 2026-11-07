import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformAuditTable } from "./platform-audit-panel";

const entry = (index: number) => ({
  id: String(index),
  action: "PLATFORM_TOTP_VERIFIED",
  actorEmail: "dani@example.com",
  createdAt: "2026-11-07T02:30:00.000Z",
});

describe("PlatformAuditTable", () => {
  it("muestra fecha, acción traducida y quién la hizo", () => {
    const html = renderToStaticMarkup(<PlatformAuditTable rows={[entry(1)]} />);

    expect(html).toContain("Ingreso con código");
    expect(html).toContain("dani@example.com");
    expect(html).toContain("23:30");
  });

  it("aclara cuando la acción vino de un comando del servidor", () => {
    const html = renderToStaticMarkup(
      <PlatformAuditTable rows={[{ ...entry(1), actorEmail: null }]} />,
    );

    expect(html).toContain("Comando del servidor");
  });

  it("avisa si todavía no hay registros", () => {
    expect(renderToStaticMarkup(<PlatformAuditTable rows={[]} />)).toContain(
      "Todavía no hay registros.",
    );
  });

  it("pagina con el componente común a partir de 11 registros", () => {
    const rows = Array.from({ length: 11 }, (_, index) => entry(index));

    expect(renderToStaticMarkup(<PlatformAuditTable rows={rows} />)).toContain(
      "Páginas de la auditoría",
    );
    expect(
      renderToStaticMarkup(<PlatformAuditTable rows={rows.slice(0, 10)} />),
    ).not.toContain("Páginas de la auditoría");
  });
});
