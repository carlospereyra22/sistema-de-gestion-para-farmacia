import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MedicineReference } from "./lib/api";
import { MedicineReferenceNote } from "./medicine-reference-note";

const reference: MedicineReference = {
  source: "preciosderemedios",
  name: "ACALIX A.P.",
  presentation: "cáps.x 30",
  laboratory: "Roemmers",
  activeIngredient: "diltiazem",
  barcode: "7795328054172",
  troquel: "",
  priceMinor: 3295000,
  pamiPriceMinor: null,
  updatedAt: null,
  saleType: "",
};

describe("nota de referencia del medicamento", () => {
  it("no muestra el enlace de la fuente debajo de la presentación", () => {
    const html = renderToStaticMarkup(
      <MedicineReferenceNote
        reference={{
          ...reference,
          referenceUrl:
            "https://preciosderemedios.com.ar/result/?busqueda=acalix",
          laboratoryMismatch: "Beta / MEGALABS ARG.",
        }}
      />,
    );
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("Precios de Remedios");
    expect(html).toContain("Laboratorio distinto");
  });

  it("avisa la baja del padrón y el laboratorio distinto", () => {
    const html = renderToStaticMarkup(
      <MedicineReferenceNote
        reference={{
          ...reference,
          officialDelisted: true,
          laboratoryMismatch: "Beta / MEGALABS ARG.",
        }}
      />,
    );
    expect(html).toContain("Dado de baja en el padrón oficial");
    expect(html).toContain("Beta / MEGALABS ARG.");
  });

  it("sin avisos no ocupa espacio entre resultados", () => {
    expect(
      renderToStaticMarkup(<MedicineReferenceNote reference={reference} />),
    ).toBe("");
  });
});
