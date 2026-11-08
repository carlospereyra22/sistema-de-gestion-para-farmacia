import { describe, expect, it } from "vitest";
import type { SaleFiscalCapabilities } from "@gestion/contracts";
import { motivoParaNoEnviarAArca } from "./enviar-a-arca";

const DIA = 24 * 60 * 60 * 1000;
const ahora = Date.parse("2026-11-30T12:00:00.000Z");
const habilitada: SaleFiscalCapabilities = {
  environment: "HOMOLOGATION",
  voucherTypes: [{ code: 11, label: "Factura C" }],
  reason: null,
};
const venta = (dias: number, datos = {}) => ({
  status: "COMPLETED" as const,
  documentType: "INTERNAL" as const,
  completedAt: new Date(ahora - dias * DIA).toISOString(),
  ...datos,
});

describe("enviar a ARCA un comprobante interno", () => {
  it("se puede hasta 30 días después de la venta", () => {
    expect(motivoParaNoEnviarAArca(venta(0), habilitada, ahora)).toBeNull();
    expect(motivoParaNoEnviarAArca(venta(30), habilitada, ahora)).toBeNull();
    expect(motivoParaNoEnviarAArca(venta(31), habilitada, ahora)).toContain(
      "más de 30 días",
    );
  });

  it("no se puede con la venta anulada o ya facturada", () => {
    expect(
      motivoParaNoEnviarAArca(
        venta(1, { status: "CANCELLED" }),
        habilitada,
        ahora,
      ),
    ).toBe("La venta está anulada.");
    expect(
      motivoParaNoEnviarAArca(
        venta(1, { documentType: "INVOICE" }),
        habilitada,
        ahora,
      ),
    ).toBe("La venta ya tiene factura.");
  });

  it("sin facturación configurada explica el motivo", () => {
    expect(motivoParaNoEnviarAArca(venta(1), null, ahora)).toContain(
      "Configurá la facturación",
    );
    expect(
      motivoParaNoEnviarAArca(
        venta(1),
        { ...habilitada, voucherTypes: [], reason: "Falta el certificado." },
        ahora,
      ),
    ).toBe("Falta el certificado.");
  });
});
