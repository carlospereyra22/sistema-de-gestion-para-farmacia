import { describe, expect, it } from "vitest";
import type { ThermalTicket } from "@gestion/contracts";
import { thermalTicketHtml } from "./thermal-ticket";
import { usesV24StoreName, v24Logo, v24StoreName } from "./v24/header";
import logo from "./v24/logo-bitmap.json";
import name from "./v24/store-name-bitmap.json";

const ticket: ThermalTicket = {
  kind: "sale",
  id: "sale",
  number: "ABC12345",
  date: "2026-09-20T15:00:00Z",
  store: { name: "Farmacia Juncos" },
  branch: "Central",
  customer: "Público general",
  items: [
    {
      name: "Producto",
      quantity: 2,
      unitPriceMinor: "10000",
      amountMinor: "20000",
    },
  ],
  subtotalMinor: "20000",
  discountMinor: "1000",
  totalMinor: "19000",
  payments: [{ method: "CASH", amountMinor: "19000" }],
};
describe("browser ticket based on V24", () => {
  it.each([
    [logo, v24Logo],
    [name, v24StoreName],
  ] as const)(
    "preserves every black pixel from the approved bitmap",
    (bitmap, url) => {
      const blackBits = [...atob(bitmap.dataBase64)].reduce(
        (sum, byte) =>
          sum + byte.charCodeAt(0).toString(2).replaceAll("0", "").length,
        0,
      );
      const svg = decodeURIComponent(url.split(",")[1]);
      const blackArea = [...svg.matchAll(/M\d+ \d+h(\d+)v1H\d+z/g)].reduce(
        (sum, match) => sum + Number(match[1]),
        0,
      );
      expect(blackArea).toBe(blackBits);
      expect(svg).toContain(`viewBox="0 0 ${bitmap.width} ${bitmap.height}"`);
    },
  );
  it("uses the original name only for the matching business and never inserts sample contact data", () => {
    expect(usesV24StoreName("farmacia juncos")).toBe(true);
    const html = thermalTicketHtml(ticket, "https://gestion.test");
    expect(html).toContain('class="store-name"');
    for (const data of ["Centenario", "24723783", "035705"])
      expect(html).not.toContain(data);
    const other = thermalTicketHtml(
      {
        ...ticket,
        store: { name: "Otro comercio", logoRaster: "00".repeat(2048) },
      },
      "https://gestion.test",
    );
    expect(other).not.toContain('class="store-name"');
    expect(other).toContain("Otro comercio</h1>");
    expect(other).toContain('class="logo custom"');
  });
  it("retains authoritative totals, discounts, normal dollar weight and fixed physical sizes", () => {
    const html = thermalTicketHtml(ticket, "https://gestion.test");
    expect(html).toContain("width:80mm");
    expect(html).toContain("width:64mm;height:5.5mm");
    expect(html).toContain("font-size:5mm;line-height:7.5mm");
    expect(html).toContain("-".repeat(48));
    expect(html).toContain('font-weight:400">$</span> 190,00');
    expect(html).toContain("DESCUENTO");
    expect(html).toContain('aria-label="Código ABC12345"');
    expect(html).not.toContain("127.0.0.1");
  });
  it("does not truncate long receipts or interpret customer input as HTML", () => {
    const html = thermalTicketHtml(
      {
        ...ticket,
        items: Array.from({ length: 150 }, (_, index) => ({
          ...ticket.items[0],
          name: `Producto ${index} <img onerror='x'> con nombre largo ${"x".repeat(100)}`,
        })),
      },
      "https://gestion.test",
    );
    expect(html.match(/class="item"/g)).toHaveLength(150);
    expect(html).toContain("Producto 149 &lt;img");
    expect(html).not.toContain("<img onerror");
  });
});
