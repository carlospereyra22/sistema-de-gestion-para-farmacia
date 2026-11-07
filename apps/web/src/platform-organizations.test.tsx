import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlatformOrganization } from "./lib/platform-api";
import { PlatformCredentialsDialog } from "./platform-credentials-dialog";
import { PlatformOrganizationsTable } from "./platform-organizations";

const subscription = {
  stage: "TRIAL",
  access: "FULL",
  daysOverdue: 0,
  exempt: false,
  trialEndsAt: "2026-11-21",
  paidThrough: null,
  extendedUntil: null,
  extendedReason: null,
  extraUsers: 1,
  extraBranches: 0,
  agreedPriceMinor: null,
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  feeMinor: "6500000",
  quota: { users: 2, branches: 1 },
} as const;

const row = (index: number): PlatformOrganization => ({
  id: String(index),
  name: `Farmacia ${index}`,
  createdAt: "2026-11-07T00:00:00.000Z",
  balanceMinor: "0",
  activeUsers: 2,
  activeBranches: 1,
  subscription,
});

const render = (rows: PlatformOrganization[]) =>
  renderToStaticMarkup(
    <PlatformOrganizationsTable rows={rows} onOpen={() => {}} />,
  );

describe("PlatformOrganizationsTable", () => {
  it("muestra estado, vencimiento, cupos y abono", () => {
    const html = render([row(1)]);

    expect(html).toContain("Farmacia 1");
    expect(html).toContain("En prueba");
    expect(html).toContain("21/11/2026");
    expect(html).toContain("2 / 2");
    expect(html).toContain("1 / 1");
    expect(html).toContain("65.000,00");
  });

  it("muestra el saldo solo cuando debe", () => {
    expect(render([{ ...row(1), balanceMinor: "2500000" }])).toContain(
      "$ 25.000,00",
    );
    expect(render([row(1)])).toContain("—");
  });

  it("una farmacia exenta muestra lo que usa, sin cupo", () => {
    const html = render([
      {
        ...row(1),
        activeUsers: 3,
        subscription: { ...subscription, exempt: true },
      },
    ]);

    expect(html).not.toContain("3 / 2");
    expect(html).toContain(">3<");
  });

  it("una farmacia sin plan no rompe la lista", () => {
    const html = render([{ ...row(1), subscription: null }]);

    expect(html).toContain("Sin plan");
  });

  it("avisa cuando la búsqueda no da resultados", () => {
    expect(render([])).toContain("No hay farmacias para esta búsqueda.");
  });

  it("pagina con el componente común a partir de 11 farmacias", () => {
    const rows = Array.from({ length: 11 }, (_, index) => row(index));

    expect(render(rows)).toContain("Páginas de farmacias");
  });
});

describe("PlatformCredentialsDialog", () => {
  it("avisa que la clave se muestra una sola vez", () => {
    const html = renderToStaticMarkup(
      <PlatformCredentialsDialog
        title="Clave temporal"
        email="duena@example.com"
        password="clave-temporal"
        onClose={() => {}}
      />,
    );

    expect(html).toContain("una sola vez");
    expect(html).toContain("duena@example.com");
    expect(html).toContain("clave-temporal");
  });
});
