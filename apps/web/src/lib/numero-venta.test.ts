import { describe, expect, it } from "vitest";
import type { Sale } from "./api";
import {
  facturaEnEspera,
  facturaEsperaCaja,
  numeroDeVenta,
} from "./numero-venta";

const id = "7f0bcfe3-1111-4222-8333-444455556666";
const trial = (status: string, number: number | null) =>
  ({
    id: "t",
    requestId: "t",
    point: 1,
    voucherType: 11,
    number,
    date: "20261107",
    totalMinor: 100,
    status,
  }) as unknown as NonNullable<Sale["fiscalTrial"]>;

describe("número de venta", () => {
  it("un ticket se identifica por su código interno", () => {
    expect(numeroDeVenta({ id, documentType: "INTERNAL" })).toEqual({
      texto: "7F0BCFE3",
      interno: "7F0BCFE3",
      prueba: false,
      despues: false,
    });
  });

  it("una factura autorizada muestra el número de ARCA", () => {
    expect(
      numeroDeVenta({
        id,
        documentType: "INVOICE",
        fiscalDocuments: [
          { status: "AUTHORIZED", point: 3, number: 152, voucherType: 11 },
        ],
      }),
    ).toEqual({
      texto: "Fact. C 00003-00000152",
      interno: "7F0BCFE3",
      prueba: false,
      despues: false,
    });
  });

  it("una factura de prueba se marca como tal", () => {
    const numero = numeroDeVenta({
      id,
      documentType: "INVOICE",
      fiscalTrial: trial("AUTHORIZED", 7),
    });
    expect(numero.texto).toBe("Fact. C 00001-00000007");
    expect(numero.prueba).toBe(true);
  });

  it("sin número todavía dice si está pendiente o rechazada", () => {
    expect(
      numeroDeVenta({
        id,
        documentType: "INVOICE",
        fiscalTrial: trial("QUEUED", null),
      }).texto,
    ).toBe("Fact. C · pendiente");
    expect(
      numeroDeVenta({
        id,
        documentType: "INVOICE",
        fiscalDocuments: [
          { status: "REJECTED", point: 3, number: null, voucherType: 11 },
        ],
      }).texto,
    ).toBe("Fact. C · rechazada");
  });

  it("en espera de caja o no emitida si la venta se anuló", () => {
    expect(
      numeroDeVenta({
        id,
        documentType: "INVOICE",
        fiscalTrial: { ...trial("HELD", null), deferredReason: "CAJA_CERRADA" },
      }),
    ).toMatchObject({ texto: "Fact. C · en espera de caja", despues: false });
    expect(
      numeroDeVenta({
        id,
        status: "CANCELLED",
        documentType: "INVOICE",
        fiscalTrial: trial("HELD", null),
      }).texto,
    ).toBe("Fact. C · no emitida");
  });

  it("marca la factura que se emitió después de la venta", () => {
    expect(
      numeroDeVenta({
        id,
        documentType: "INVOICE",
        fiscalDocuments: [
          {
            status: "AUTHORIZED",
            point: 3,
            number: 9,
            voucherType: 11,
            deferredReason: "COMPROBANTE_INTERNO",
          },
        ],
      }).despues,
    ).toBe(true);
  });
});

describe("factura en espera de ARCA", () => {
  const venta = (datos: Partial<Sale>) =>
    ({ status: "COMPLETED", documentType: "INVOICE", ...datos }) as Sale;

  it("espera mientras está en cola, enviada o por confirmar", () => {
    for (const status of ["QUEUED", "PENDING", "UNCERTAIN"])
      expect(facturaEnEspera(venta({ fiscalTrial: trial(status, null) }))).toBe(
        true,
      );
  });

  it("no espera si ya se resolvió, espera la caja, es interno o se anuló", () => {
    expect(
      facturaEnEspera(venta({ fiscalTrial: trial("AUTHORIZED", 7) })),
    ).toBe(false);
    expect(
      facturaEnEspera(venta({ fiscalTrial: trial("REJECTED", null) })),
    ).toBe(false);
    // En espera de caja no se consulta: depende de que alguien incorpore el cobro.
    expect(facturaEnEspera(venta({ fiscalTrial: trial("HELD", null) }))).toBe(
      false,
    );
    expect(
      facturaEnEspera(
        venta({ documentType: "INTERNAL", fiscalTrial: trial("QUEUED", null) }),
      ),
    ).toBe(false);
    expect(
      facturaEnEspera(
        venta({ status: "CANCELLED", fiscalTrial: trial("QUEUED", null) }),
      ),
    ).toBe(false);
  });
});

describe("venta con la factura esperando la caja", () => {
  it("se detecta en homologación y en producción", () => {
    expect(
      facturaEsperaCaja({
        documentType: "INVOICE",
        fiscalTrial: trial("HELD", null),
      }),
    ).toBe(true);
    expect(
      facturaEsperaCaja({
        documentType: "INVOICE",
        fiscalDocument: { status: "HELD" },
      }),
    ).toBe(true);
  });

  it("una factura en cola o un comprobante interno no esperan", () => {
    expect(
      facturaEsperaCaja({
        documentType: "INVOICE",
        fiscalTrial: trial("QUEUED", null),
      }),
    ).toBe(false);
    expect(facturaEsperaCaja({ documentType: "INTERNAL" })).toBe(false);
  });
});
