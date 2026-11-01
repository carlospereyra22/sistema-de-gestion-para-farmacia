import {
  MedicineReferenceService,
  parsePriceMinor,
} from "./medicine-reference.service";
import { MedicineReferenceController } from "./medicine-reference.controller";
import type { CatalogService } from "./catalog.service";
import type { AlfaBetaService } from "./alfabeta.service";
import type { ExternalCatalogService } from "./external-catalog.service";
import type { AuthenticatedRequest } from "../auth/auth.types";

const row = {
  NOMBRE: "ACTRON RAPIDA ACCION",
  PRESENTACION: "400 mg cáps.x 20",
  LABORATORIO: "Bayer",
  C_BARRA: "7793640992769",
  GTIN1: "07793640992769",
  PRECIO: "8275",
  DROGA: "ibuprofeno",
  FORMA: "Cápsulas",
  TIPO_DE_VENTA: "Venta Libre",
  BAJA: "0",
  VIGENCIA: 1,
};

describe("medicine barcode lookup", () => {
  afterEach(() => jest.restoreAllMocks());
  it("indexes exact EAN and GTIN, deduplicates equivalent rows and shares requests", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            row,
            row,
            { ...row, NOMBRE: "Baja", BAJA: "1" },
            { ...row, NOMBRE: "Invalid", C_BARRA: "7793640992768", GTIN1: "" },
          ]),
        ),
      );
    const service = new MedicineReferenceService();
    const [first, second] = await Promise.all([
      service.byBarcode("7793640992769"),
      service.byBarcode("07793640992769"),
    ]);
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({
      name: row.NOMBRE,
      presentation: row.PRESENTACION,
      source: "official",
      priceMinor: 827500,
      pharmaceuticalForm: "Cápsulas",
      prescriptionRequired: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ searchdata: "%%%" }),
    );
    expect(await service.byBarcode("7791274197864")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains conflicting presentations instead of selecting the first", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([row, { ...row, PRESENTACION: "x10" }])),
      );
    expect(
      await new MedicineReferenceService().byBarcode(row.C_BARRA),
    ).toHaveLength(2);
  });
  it("retries failures, validates before downloading and does not treat missing price as zero", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(
        async () => new Response(JSON.stringify([{ ...row, PRECIO: null }])),
      );
    const service = new MedicineReferenceService();
    await expect(service.byBarcode("bad")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(service.byBarcode(row.C_BARRA)).rejects.toThrow(
      "No se pudo consultar",
    );
    expect((await service.byBarcode(row.C_BARRA))[0]?.priceMinor).toBeNull();
    expect(parsePriceMinor("")).toBeNull();
    expect(parsePriceMinor(0)).toBe(0);
  });
  it("requires permission before querying and only offers automatic selection for one match", async () => {
    const assertPermission = jest.fn().mockResolvedValue(undefined);
    const byBarcode = jest.fn().mockResolvedValue([row, row]);
    const controller = new MedicineReferenceController(
      { assertPermission } as unknown as CatalogService,
      { byBarcode } as unknown as MedicineReferenceService,
      {} as AlfaBetaService,
      {
        medicineFallback: jest.fn().mockResolvedValue([]),
      } as unknown as ExternalCatalogService,
    );
    const request = { auth: { sub: "actor" } } as AuthenticatedRequest;
    expect(
      (await controller.barcode(request, "org", row.C_BARRA))
        .automaticSelection,
    ).toBe(false);
    expect(assertPermission).toHaveBeenCalledWith(
      "actor",
      "org",
      "CATALOG_MANAGE",
    );
    byBarcode.mockClear();
    assertPermission.mockRejectedValueOnce(new Error("forbidden"));
    await expect(
      controller.barcode(request, "org", row.C_BARRA),
    ).rejects.toThrow("forbidden");
    expect(byBarcode).not.toHaveBeenCalled();
  });
  it("offers retail evidence without automatic linking when the official index misses", async () => {
    const fallback = {
      name: "Ibu 400 x20",
      presentation: "20 comprimidos",
      barcode: "7798420160383",
      source: "public_farmalife",
    };
    const controller = new MedicineReferenceController(
      {
        assertPermission: jest.fn().mockResolvedValue(undefined),
      } as unknown as CatalogService,
      {
        byBarcode: jest.fn().mockResolvedValue([]),
      } as unknown as MedicineReferenceService,
      {} as AlfaBetaService,
      {
        medicineFallback: jest.fn().mockResolvedValue([fallback]),
      } as unknown as ExternalCatalogService,
    );
    expect(
      await controller.barcode(
        { auth: { sub: "actor" } } as AuthenticatedRequest,
        "org",
        fallback.barcode,
      ),
    ).toMatchObject({
      matches: [],
      retailMatches: [fallback],
      automaticSelection: false,
      officialUnavailable: false,
    });
  });
});
