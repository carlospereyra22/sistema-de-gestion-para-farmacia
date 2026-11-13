import { describe, expect, it } from "vitest";
import { diaArgentino, filtrarHistorialLocal } from "./historial-local";

const venta = (
  id: string,
  completedAt: string,
  extra: Partial<{ status: string; documentType: string; method: string }> = {},
) => ({
  id,
  status: extra.status ?? "COMPLETED",
  documentType: extra.documentType,
  completedAt,
  payments: [{ method: extra.method ?? "CASH" }],
});

describe("historial filtrado en la PC (SISTEMA-104)", () => {
  it("usa el día de Argentina: las 20:14 del 17/10 son el 17 aunque en UTC sea el 18", () => {
    expect(diaArgentino("2026-10-17T23:14:35.428Z")).toBe("2026-10-17");
    expect(diaArgentino("2026-10-18T02:59:59.000Z")).toBe("2026-10-17");
    expect(diaArgentino("2026-10-18T03:00:00.000Z")).toBe("2026-10-18");
  });

  it("filtra por fechas, estado, comprobante, medio y código, de la más nueva a la más vieja", () => {
    const ventas = [
      venta("d7214329-2b3d-46a6-964a-a46f32e4f652", "2026-10-17T23:14:35Z"),
      venta("baa0ec4c-0000-4000-8000-000000000000", "2026-10-17T15:00:00Z", {
        method: "CARD",
      }),
      venta("11111111-0000-4000-8000-000000000000", "2026-10-20T15:00:00Z", {
        status: "CANCELLED",
        documentType: "INVOICE",
      }),
    ];
    expect(
      filtrarHistorialLocal(ventas, {
        from: "2026-10-17",
        to: "2026-10-17",
      }).map((v) => v.id.slice(0, 8)),
    ).toEqual(["d7214329", "baa0ec4c"]);
    expect(filtrarHistorialLocal(ventas, { method: "CARD" })).toHaveLength(1);
    expect(filtrarHistorialLocal(ventas, { status: "CANCELLED" })).toHaveLength(
      1,
    );
    expect(
      filtrarHistorialLocal(ventas, { documentType: "INTERNAL" }),
    ).toHaveLength(2);
    expect(filtrarHistorialLocal(ventas, { q: "D7214" })[0]?.id).toMatch(
      /^d7214329/,
    );
  });
});
