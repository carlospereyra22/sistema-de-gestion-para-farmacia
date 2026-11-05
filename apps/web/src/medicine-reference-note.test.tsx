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
  it("lleva al link exacto de la fuente", () => {
    const html = renderToStaticMarkup(
      <MedicineReferenceNote
        reference={{
          ...reference,
          referenceUrl:
            "https://preciosderemedios.com.ar/result/?busqueda=acalix",
        }}
      />,
    );
    expect(html).toContain(
      'href="https://preciosderemedios.com.ar/result/?busqueda=acalix"',
    );
    expect(html).toContain("Precios de Remedios");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("el padrón va sin link porque su web no abre un producto", () => {
    expect(
      renderToStaticMarkup(
        <MedicineReferenceNote
          reference={{ ...reference, source: "official", referenceUrl: null }}
        />,
      ),
    ).not.toContain("<a ");
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

  it("sin link ni avisos no muestra texto", () => {
    expect(
      renderToStaticMarkup(<MedicineReferenceNote reference={reference} />),
    ).not.toContain("<a ");
  });
});
