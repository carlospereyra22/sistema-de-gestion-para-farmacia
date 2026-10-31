import { expect, it } from "vitest";
import { buildPriceListPdf } from "./price-list-pdf";
import { parsePrice } from "./price-lists-api";

it("starts with medicines, followed by generics and hospital supplies", () => {
  const pdf = new TextDecoder().decode(
    buildPriceListPdf({
      title: "Lista septiembre 2026",
      subtitle: "",
      organization: "Farmacia",
      rows: [
        {
          name: "Alcohol",
          category: "Insumos hospitalarios",
          amountMinor: "10000",
          offer: false,
        },
        {
          name: "Amoxicilina",
          category: "Genéricos",
          amountMinor: "20000",
          offer: false,
        },
        {
          name: "Actron",
          category: "Medicamentos",
          amountMinor: "30000",
          offer: false,
        },
      ],
    }),
  );
  const labels = [...pdf.matchAll(/<([0-9a-f]+)> Tj/g)].map((match) =>
    String.fromCharCode(
      ...(match[1].match(/../g) ?? []).map((byte) => parseInt(byte, 16)),
    ),
  );
  expect(labels).not.toContain("MEDICAMENTOS");
  expect(labels.indexOf("Actron")).toBeLessThan(labels.indexOf("GENÉRICOS"));
  expect(labels.indexOf("GENÉRICOS")).toBeLessThan(
    labels.indexOf("INSUMOS HOSPITALARIOS"),
  );
});

it("uses the large title only on the first page and keeps column headings on every page", () => {
  const pdf = new TextDecoder().decode(
    buildPriceListPdf({
      title: "CATALOGO",
      subtitle: "",
      organization: "Farmacia",
      rows: Array.from({ length: 100 }, (_, i) => ({
        name: `Producto ${i}`,
        category: "Medicamentos",
        amountMinor: "10000",
        offer: false,
      })),
    }),
  );
  const count = Number(pdf.match(/\/Count (\d+)/)?.[1]);
  expect(count).toBeGreaterThan(1);
  expect(pdf.match(/<434154414c4f474f> Tj/g)).toHaveLength(1);
  expect(pdf.match(/<50524543494f53> Tj/g)).toHaveLength(count);
});
it("parses prices exactly and rejects malformed and excessive values", () => {
  expect(parsePrice("10,25")).toBe("1025");
  expect(parsePrice("0")).toBe("0");
  expect(parsePrice("9999999999.99")).toBe("999999999999");
  for (const value of ["", "-1", "1.001", "NaN", "1e4", "10000000000"])
    expect(parsePrice(value)).toBeNull();
});
it("creates multipage A4 PDF with valid xref offsets and escaped text", () => {
  const pdf = new TextDecoder().decode(
    buildPriceListPdf({
      title: "Ofertas septiembre",
      subtitle: "Vigencia septiembre 2026",
      organization: "Farmacia Ñandú",
      rows: Array.from({ length: 90 }, (_, i) => ({
        name: `Medicamento ${i} (prueba)`,
        category: i < 40 ? "Medicamentos" : "Genéricos",
        amountMinor: "100050",
        offer: i % 2 === 0,
      })),
    }),
  );
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(pdf).toContain("/MediaBox [0 0 595 842]");
  expect(Number(pdf.match(/\/Count (\d+)/)?.[1])).toBeGreaterThan(1);
  expect(pdf).not.toContain("(prueba)");
  const start = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
  expect(pdf.slice(start, start + 4)).toBe("xref");
  const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n /gm)];
  offsets.forEach((match, index) =>
    expect(pdf.slice(Number(match[1]))).toMatch(
      new RegExp(`^${index + 1} 0 obj`),
    ),
  );
});
