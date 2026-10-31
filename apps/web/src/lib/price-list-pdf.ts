export type PriceListDocument = {
  title: string;
  subtitle: string;
  organization: string;
  rows: {
    name: string;
    category: string;
    amountMinor: string;
    offer: boolean;
  }[];
};

function categoryKey(category: string): string {
  return category
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function categoryOrder(category: string): number {
  const key = categoryKey(category);
  if (key === "medicamentos") return 0;
  if (key === "genericos") return 2;
  if (key === "hospitalarios" || key === "insumos hospitalarios") return 3;
  return 1;
}
// PDF standard fonts use WinAnsi. Text is encoded as hex so names cannot inject PDF operators.
function hexText(text: string) {
  const extra: Record<string, number> = {
    "€": 128,
    "–": 150,
    "—": 151,
    "’": 146,
    "“": 147,
    "”": 148,
  };
  return Array.from(text)
    .map((char) =>
      (
        extra[char] ??
        ((char.codePointAt(0) ?? 63) <= 255 ? char.charCodeAt(0) : 63)
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}
function wrap(text: string, width: number) {
  const words = text.replace(/[\r\n\t]/g, " ").split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (let word of words) {
    if (current && current.length + word.length + 1 > width) {
      lines.push(current);
      current = "";
    }
    while (word.length > width) {
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    current += (current ? " " : "") + word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
export function buildPriceListPdf(document: PriceListDocument): Uint8Array {
  const pages: string[] = [];
  let content = "";
  let y = 0;
  let page = 0;
  const text = (
    value: string,
    x: number,
    top: number,
    size = 10,
    bold = false,
    color = "0.12 0.17 0.25",
  ) => {
    content += `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${x} ${842 - top} Tm <${hexText(value)}> Tj ET\n`;
  };
  const rect = (top: number, height: number, color: string) => {
    content += `${color} rg 28 ${842 - top - height} 539 ${height} re f\n`;
  };
  const finish = () => {
    text(
      `${document.organization} · Página ${page}`,
      30,
      818,
      8,
      false,
      "0.4 0.45 0.52",
    );
    pages.push(content);
  };
  const start = () => {
    content = "";
    page++;
    if (page === 1) {
      const title = wrap(document.title.toUpperCase(), 48);
      const details = wrap(
        [document.organization, document.subtitle].filter(Boolean).join(" · "),
        90,
      );
      const headerHeight = 24 + title.length * 19 + details.length * 12;
      if (headerHeight > 250)
        throw new Error(
          "El título o subtítulo es demasiado largo para exportar.",
        );
      rect(25, headerHeight, "0.11 0.16 0.24");
      title.forEach((line, index) =>
        text(line, 40, 47 + index * 19, 16, true, "1 1 1"),
      );
      details.forEach((line, index) =>
        text(
          line,
          40,
          51 + title.length * 19 + index * 12,
          9,
          false,
          "0.76 0.83 0.9",
        ),
      );
      rect(25 + headerHeight - 3, 3, "0 0.5 0.64");
      y = 25 + headerHeight + 22;
    } else {
      y = 28;
    }
    rect(y, 24, "0.93 0.95 0.97");
    text("N°", 36, y + 16, 8, true);
    text("DESCRIPCIÓN DEL PRODUCTO", 66, y + 16, 8, true);
    text("PRECIOS", 510, y + 16, 8, true);
    y += 24;
  };
  start();
  let category: string | undefined;
  let index = 0;
  for (const row of [...document.rows].sort(
    (a, b) =>
      categoryOrder(a.category) - categoryOrder(b.category) ||
      categoryKey(a.category).localeCompare(categoryKey(b.category), "es") ||
      a.name.localeCompare(b.name, "es"),
  )) {
    const names = wrap(row.name + (row.offer ? " (OFERTA)" : ""), 58);
    if (names.length > 40)
      throw new Error("La descripción es demasiado larga para exportar.");
    const height = Math.max(21, names.length * 12 + 9);
    const key = categoryKey(row.category);
    const showCategory = category !== key && key !== "medicamentos";
    const categoryHeight = showCategory ? 34 : 0;
    if (y + height + categoryHeight > 790) {
      finish();
      start();
    }
    if (showCategory) {
      y += 6;
      rect(y, 24, "0.93 0.95 0.97");
      content += `0 0.5 0.64 rg 28 ${842 - y - 24} 3 24 re f\n`;
      text(row.category.toUpperCase(), 39, y + 16, 10, true);
      y += 28;
    }
    category = key;
    content += `0.82 0.87 0.91 RG 0.4 w 28 ${842 - y - height} m 567 ${842 - y - height} l S\n`;
    index++;
    text(String(index), 37, y + 16, 9, false, "0.5 0.57 0.65");
    names.forEach((name, n) =>
      text(
        name,
        66,
        y + 14 + n * 12,
        9,
        false,
        row.offer ? "0.03 0.48 0.2" : "0.15 0.2 0.29",
      ),
    );
    const amount = BigInt(row.amountMinor);
    const price = `$ ${(amount / 100n).toLocaleString("es-AR")},${String(amount % 100n).padStart(2, "0")}`;
    // Fixed right-hand column, kept separate from wrapping descriptions.
    text(
      price,
      Math.max(432, 558 - price.length * 5.6),
      y + 16,
      10,
      true,
      row.offer ? "0.03 0.48 0.2" : "0.12 0.17 0.25",
    );
    y += height;
  }
  finish();
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  for (const pageContent of pages) {
    const streamId = objects.length + 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    objects.push(
      `<< /Length ${pageContent.length} >>\nstream\n${pageContent}endstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
export function downloadPriceListPdf(document: PriceListDocument) {
  const data = buildPriceListPdf(document);
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(data)], { type: "application/pdf" }),
  );
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${document.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Lista de precios"}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
