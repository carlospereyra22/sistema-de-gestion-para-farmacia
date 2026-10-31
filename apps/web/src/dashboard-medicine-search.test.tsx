import { renderToStaticMarkup } from "react-dom/server";
import { AlfaBetaMedicineCard } from "./alfabeta-medicine-card";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DashboardMedicineSearch,
  MedicineSearchResults,
} from "./dashboard-medicine-search";
import { searchMedicineReferences, type MedicineReference } from "./lib/api";
import { groupMedicines, referenceMoney } from "./lib/medicine-search";
import { MedicinePresentationRow } from "./medicine-presentation-row";

const reference: MedicineReference = {
  source: "official",
  name: "Actron",
  presentation: "400 mg x 10",
  laboratory: "Laboratorio de prueba",
  activeIngredient: "ibuprofeno",
  barcode: "7790000000000",
  troquel: "123",
  priceMinor: 1061500,
  pamiPriceMinor: null,
  updatedAt: "03/09/2026",
  saleType: "Venta libre",
};
afterEach(() => vi.unstubAllGlobals());

describe("dashboard medicine search", () => {
  it("uses compact full-width rows without repeated pill icons", () => {
    const compact = renderToStaticMarkup(
      <AlfaBetaMedicineCard
        compact
        item={{ id: "actron.html", name: "ACTRON", laboratory: "Bayer" }}
        token="test"
        organizationId="org"
      />,
    );
    expect(compact).toContain("Ver presentaciones");
    expect(compact).not.toContain("lucide-pill");
    const referenceRows = renderToStaticMarkup(
      <MedicineSearchResults results={[reference]} />,
    );
    expect(referenceRows).not.toContain("lg:grid-cols-2");
    expect(referenceRows).toContain("sm:text-right");
    expect(referenceRows).toContain("tabular-nums");
    expect(referenceRows).toContain("Más información");
    expect(referenceRows).not.toContain('open=""');
    expect(referenceRows).toContain("1 presentación");
  });
  it("keeps prefetched AlfaBeta results closed until the user opens them", () => {
    for (const prefetch of [true, false]) {
      const html = renderToStaticMarkup(
        <AlfaBetaMedicineCard
          compact
          prefetch={prefetch}
          item={{ id: "actron.html", name: "ACTRON", laboratory: "Bayer" }}
          token="test"
          organizationId="org"
        />,
      );
      expect(html).not.toMatch(/<details[^>]*\sopen=/);
    }
  });
  it("shares one price heading per medicine and keeps presentation data intact", () => {
    const html = renderToStaticMarkup(
      <MedicineSearchResults
        results={[
          reference,
          {
            ...reference,
            presentation: "400 mg x 20",
            updatedAt: "04/09/2026",
          },
        ]}
      />,
    );
    expect(html.match(/Precio de referencia/g)).toHaveLength(1);
    expect(html).toContain("2 presentaciones");
    expect(html).toContain("w-full py-3");
    expect(html).not.toContain("max-w-4xl");
    expect(html).toContain("03/09/2026");
    expect(html).toContain("04/09/2026");
    expect(html).toContain("400 mg x 20");
    const zero = renderToStaticMarkup(
      <MedicinePresentationRow
        presentation="cáps.blandas x 10"
        priceMinor={0}
        updatedAt={null}
      />,
    );
    expect(zero).toContain("cáps.blandas x 10");
    expect(zero).toContain("0,00");
    expect(zero).toContain("no disponible");
  });
  it("keeps AlfaBeta presentations accessible without photo controls", () => {
    const html = renderToStaticMarkup(
      <AlfaBetaMedicineCard
        item={{ id: "actron.html", name: "ACTRON", laboratory: "Bayer" }}
        token="test-token"
        organizationId="test-org"
      />,
    );
    expect(html).toContain("ACTRON");
    expect(html).toContain("presentaciones");
    expect(html).toContain("<details");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Mostrar foto");
    expect(html).not.toContain("Sin foto");
  });
  it("groups presentations without mixing laboratories or sources", () => {
    const groups = groupMedicines([
      reference,
      { ...reference, presentation: "400 mg x 20" },
      { ...reference, laboratory: "Otro" },
      { ...reference, source: "preciosderemedios" },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]?.items).toHaveLength(2);
    expect(groupMedicines([])).toEqual([]);
  });
  it("distinguishes missing prices from zero and formats cents", () => {
    expect(referenceMoney(null)).toBe("Precio no informado");
    expect(referenceMoney(0)).toContain("0,00");
    expect(referenceMoney(1061500)).toContain("10.615,00");
  });
  it("shows expandable presentations and provenance, without invented images", () => {
    const html = renderToStaticMarkup(
      <MedicineSearchResults results={[reference]} />,
    );
    for (const value of [
      "<details",
      "<summary",
      "Actron",
      "400 mg x 10",
      "ibuprofeno",
      "03/09/2026",
      "10.615,00",
      "Vademécum nacional",
      "7790000000000",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain("<img");
  });
  it("marks unavailable fields rather than inventing values", () => {
    const html = renderToStaticMarkup(
      <MedicineSearchResults
        results={[
          {
            ...reference,
            priceMinor: null,
            updatedAt: null,
            activeIngredient: "",
          },
        ]}
      />,
    );
    expect(html).toContain("Precio no informado");
    expect(html).toContain("no disponible");
    expect(html).toContain("No informado");
  });
  it("renders labeled controls without introductory or idle helper text", () => {
    const html = renderToStaticMarkup(
      <DashboardMedicineSearch token="test" organizationId="org" />,
    );
    expect(html).toContain('for="medicine-query"');
    expect(html).toContain('for="medicine-source"');
    expect(html).not.toContain("Buscar no modifica");
    expect(html).not.toContain("Consulta externa:");
    expect(html).not.toContain("Las consultas pueden reutilizarse");
    expect(html).not.toContain("Escribí al menos dos caracteres");
    expect(html).toContain('role="status"');
    expect(html).toContain("disabled");
    expect(html).toContain('value="alfabeta" selected=""');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('action="https://');
    expect(html).not.toContain("sin salir del inicio");
  });
  it("passes cancellation and authentication through the read-only API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([reference]), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    expect(
      await searchMedicineReferences(
        "token",
        "org",
        "Actron 400",
        "official",
        controller.signal,
      ),
    ).toEqual([reference]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("q=Actron+400&source=official"),
      { headers: { Authorization: "Bearer token" }, signal: controller.signal },
    );
  });
});
