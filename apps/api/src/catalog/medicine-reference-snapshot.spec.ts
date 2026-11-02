import {
  isPartialSnapshot,
  officialCandidates,
  officialIndex,
  referenceFromSnapshot,
  snapshotRow,
} from "./medicine-reference-snapshot";
import {
  MedicineReferenceService,
  officialReferences,
} from "./medicine-reference.service";
import type { PrismaService } from "../prisma/prisma.service";

const actron = {
  source: "official" as const,
  name: "ACTRON 400",
  presentation: "400 mg cáps.x 10",
  laboratory: "Bayer Consumer",
  activeIngredient: "ibuprofeno",
  barcode: "7793640215479",
  troquel: "123",
  priceMinor: 297900,
  pamiPriceMinor: null,
  updatedAt: "20/10/2026",
  saleType: "Venta Libre",
  pharmaceuticalForm: "Cápsulas",
  concentration: "400 mg",
  prescriptionRequired: false,
};

describe("copia local del padrón", () => {
  it("detecta una descarga parcial frente a la anterior", () => {
    expect(isPartialSnapshot(16000, 16300)).toBe(false);
    expect(isPartialSnapshot(9000, 16300)).toBe(true);
    expect(isPartialSnapshot(10, 0)).toBe(false);
  });

  it("guarda y lee una referencia sin perder datos", () => {
    const row = snapshotRow(actron, "run");
    expect(row).toEqual(
      expect.objectContaining({
        gtin: "07793640215479",
        priceMinor: 297900n,
        searchText: "actron 400 400 mg caps.x 10 bayer consumer ibuprofeno",
      }),
    );
    expect(
      referenceFromSnapshot({
        ...row,
        id: "row",
        lookupKey: "",
        refreshedAt: new Date(),
      } as Parameters<typeof referenceFromSnapshot>[0]),
    ).toEqual(actron);
  });

  it("cuenta una vez el mismo código con y sin cero en C_BARRA y GTIN1", () => {
    const rows = officialReferences([
      {
        NOMBRE: "ACTRON 400",
        PRESENTACION: "400 mg cáps.x 10",
        C_BARRA: "7793640215479",
        GTIN1: "07793640215479",
      },
      {
        NOMBRE: "DADO DE BAJA",
        PRESENTACION: "x 10",
        BAJA: 1,
        C_BARRA: "7793640215479",
      },
    ]);
    expect(rows.map((row) => row.barcode)).toEqual(["7793640215479"]);
  });

  it("no duplica una fila que coincide por código y por nombre", () => {
    const index = officialIndex([actron]);
    expect(
      officialCandidates(index, "Actron 400", "07793640215479"),
    ).toHaveLength(1);
  });
});

describe("búsqueda con copia local", () => {
  function service(rows: ReturnType<typeof snapshotRow>[]) {
    const prisma = {
      medicineReferenceSnapshot: {
        findFirst: jest.fn().mockResolvedValue({ refreshedAt: new Date() }),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const fetchSpy = jest.spyOn(global, "fetch");
    return {
      prisma,
      fetchSpy,
      instance: new MedicineReferenceService(
        prisma as unknown as PrismaService,
      ),
    };
  }
  afterEach(() => jest.restoreAllMocks());

  it("busca por nombre sin salir a internet", async () => {
    const { prisma, fetchSpy, instance } = service([
      snapshotRow(actron, "run"),
    ]);
    const found = await instance.search("actron 400", "official");
    expect(found.map((item) => item.name)).toEqual(["ACTRON 400"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.medicineReferenceSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source: "official",
          AND: [{ searchText: { contains: "actron" } }],
        },
      }),
    );
  });

  it("escanea un código contra la copia local", async () => {
    const { fetchSpy, instance } = service([snapshotRow(actron, "run")]);
    expect(await instance.byBarcode("7793640215479")).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sin copia reciente consulta la fuente externa", async () => {
    const { prisma, fetchSpy, instance } = service([]);
    prisma.medicineReferenceSnapshot.findFirst.mockResolvedValue(null);
    fetchSpy.mockResolvedValue(new Response("[]"));
    await instance.search("actron", "official");
    expect(fetchSpy).toHaveBeenCalled();
  });
});
