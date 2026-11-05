import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { AlfaBetaService } from "../src/catalog/alfabeta.service";
import {
  MedicineCatalogService,
  type CatalogImportRecord,
} from "../src/catalog/medicine-catalog.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { PrismaService } from "../src/prisma/prisma.service";

const product = (
  overrides: Partial<CatalogImportRecord> = {},
): CatalogImportRecord =>
  ({
    kind: "product",
    externalKey: "ab-1",
    name: "ACTRON 400",
    presentation: "cáps.x 10",
    activeIngredient: "ibuprofeno",
    laboratory: "Bayer",
    pharmaceuticalForm: "Cápsulas/Softgels",
    saleCondition: "Venta Libre",
    troquel: "",
    priceSource: "official",
    priceMinor: 900000,
    referenceUrl: null,
    sourceRow: "",
    officialDelisted: false,
    laboratoryMismatch: null,
    barcodes: ["7793640215479"],
    ...overrides,
  }) as CatalogImportRecord;

const remedies = "https://preciosderemedios.com.ar/result/?busqueda=a&combo=b";
const remediesPage = (price: number, footer = "") =>
  `<tr data-price="${price}"><td><span class="font-bold x">ZOLOM</span> <span class="font-normal x">10mg Comp. x 30</span></td><td><div class="laboratorio-text x">ELEA</div></td></tr>${footer}`;

describe("base de medicamentos en esquema aislado", () => {
  let db: PrismaService, service: MedicineCatalogService;
  const alfabeta = { page: jest.fn() };
  const schema = `medicine_catalog_${randomUUID().replaceAll("-", "")}`;
  const realFetch = global.fetch;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local test DB only");
    url.searchParams.set("schema", schema);
    const result = spawnSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        timeout: 90000,
        stdio: "pipe",
      },
    );
    if (result.status !== 0)
      throw new Error(
        "Could not prepare isolated schema: " +
          String(result.stderr).replaceAll(url.toString(), "[database]"),
      );
    db = new PrismaService({
      databaseUrl: url.toString(),
    } as EnvironmentService);
    await db.$connect();
    service = new MedicineCatalogService(
      db,
      alfabeta as unknown as AlfaBetaService,
    );
    service.pause = () => Promise.resolve();
  }, 120000);

  afterEach(async () => {
    global.fetch = realFetch;
    alfabeta.page.mockReset();
    await db.medicineCatalogItem.deleteMany();
    await db.medicineLaboratoryAlias.deleteMany();
  });

  afterAll(async () => {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  });

  it("importa, y repetir la carga no pisa un precio actualizado", async () => {
    const records: CatalogImportRecord[] = [
      product(),
      {
        kind: "laboratory",
        catalogName: "Beta",
        sourceName: "MEGALABS",
        status: "distinto",
      },
    ];
    expect(await service.importRecords(records)).toEqual({
      created: 1,
      skipped: 0,
      laboratories: 1,
    });
    await db.medicineCatalogItem.updateMany({ data: { priceMinor: 111n } });
    expect(await service.importRecords(records)).toEqual({
      created: 0,
      skipped: 1,
      laboratories: 1,
    });
    expect((await db.medicineCatalogItem.findFirstOrThrow()).priceMinor).toBe(
      111n,
    );
  });

  it("la base rechaza un precio en cero y Remedios sin link", async () => {
    await expect(
      service.importRecords([product({ priceMinor: 0 } as never)]),
    ).rejects.toThrow();
    await expect(
      service.importRecords([
        product({ priceSource: "preciosderemedios" } as never),
      ]),
    ).rejects.toThrow();
  });

  it("busca por código, nombre, laboratorio y droga", async () => {
    await service.importRecords([
      product(),
      product({
        externalKey: "ab-2",
        name: "IBU 400",
        laboratory: "Bagó",
        barcodes: ["7790000000001"],
      } as never),
    ]);
    const names = async (query: string) =>
      (await service.search(query)).map((item) => item.name);
    expect(await names("actron")).toEqual(["ACTRON 400"]);
    expect(await names("bago")).toEqual(["IBU 400"]);
    expect(await names("ibuprofeno")).toEqual(["ACTRON 400", "IBU 400"]);
    expect(await names("7793640215479")).toEqual(["ACTRON 400"]);
    // Un código con dígito de control inválido también se encuentra
    expect(await names("7790000000001")).toEqual(["IBU 400"]);
    expect(await names("inexistente")).toEqual([]);
  });

  it("actualiza desde el padrón, marca bajas y guarda la fecha", async () => {
    await service.importRecords([
      product(),
      product({
        externalKey: "ab-2",
        priceSource: "preciosderemedios",
        referenceUrl: remedies,
        sourceRow: "ZOLOM 10mg Comp. x 30",
        barcodes: ["7790000000001"],
      } as never),
    ]);
    const result = await service.refreshOfficial([
      { CLAVE: 1, PRECIO: 9500, TROQUEL: "55", BAJA: 0 },
      { CLAVE: 2, PRECIO: "", BAJA: 1 },
    ]);
    expect(result).toEqual({ updated: 1, delisted: 1 });
    const official = await db.medicineCatalogItem.findUniqueOrThrow({
      where: { externalKey: "ab-1" },
    });
    expect(official.priceMinor).toBe(950000n);
    expect(official.troquel).toBe("55");
    expect(official.priceCheckedAt).not.toBeNull();
    const delisted = await db.medicineCatalogItem.findUniqueOrThrow({
      where: { externalKey: "ab-2" },
    });
    expect(delisted.officialDelisted).toBe(true);
    expect(delisted.priceSource).toBe("preciosderemedios");
    expect(delisted.priceMinor).toBe(900000n);
  });

  it("un dado de baja con precio pasa al padrón y conserva la marca", async () => {
    await service.importRecords([
      product({
        priceSource: "preciosderemedios",
        referenceUrl: remedies,
        sourceRow: "ZOLOM 10mg Comp. x 30",
      } as never),
    ]);
    await service.refreshOfficial([{ CLAVE: 1, PRECIO: 6632, BAJA: 1 }]);
    const item = await db.medicineCatalogItem.findFirstOrThrow();
    expect(item.priceSource).toBe("official");
    expect(item.priceMinor).toBe(663200n);
    expect(item.referenceUrl).toBeNull();
    expect(item.officialDelisted).toBe(true);
  });

  it("lee un link una vez, sigue las páginas y actualiza", async () => {
    await service.importRecords([
      product({
        priceSource: "preciosderemedios",
        priceMinor: 1000000,
        referenceUrl: remedies,
        sourceRow: "ZOLOM 10mg Comp. x 30",
      } as never),
    ]);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response("<p>Mostrando 1-15 de 16</p>", { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(remediesPage(12000), { status: 200 }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;
    const { remedies: result } = await service.refreshLinkedSources();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("pagina=2");
    expect(result).toEqual(expect.objectContaining({ links: 1, updated: 1 }));
    const item = await db.medicineCatalogItem.findFirstOrThrow();
    expect(item.priceMinor).toBe(1200000n);
    expect(item.officialDelisted).toBe(false);
  });

  it("un salto de precio queda para revisar y conserva el precio", async () => {
    await service.importRecords([
      product({
        priceSource: "preciosderemedios",
        priceMinor: 100000,
        referenceUrl: remedies,
        sourceRow: "ZOLOM 10mg Comp. x 30",
      } as never),
    ]);
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(remediesPage(90000), { status: 200 }),
      ) as unknown as typeof fetch;
    await service.refreshLinkedSources();
    const item = await db.medicineCatalogItem.findFirstOrThrow();
    expect(item.priceMinor).toBe(100000n);
    expect(item.reviewReason).toContain("muy distinto");
  });

  it("con la fuente caída conserva precios y deja de insistir", async () => {
    await service.importRecords(
      Array.from({ length: 7 }, (_, index) =>
        product({
          externalKey: `ab-${index}`,
          priceSource: "preciosderemedios",
          referenceUrl: `${remedies}${index}`,
          sourceRow: "ZOLOM 10mg Comp. x 30",
          barcodes: [],
        } as never),
      ),
    );
    const fetchMock = jest.fn().mockRejectedValue(new Error("caída"));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { remedies: result } = await service.refreshLinkedSources();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result).toEqual(
      expect.objectContaining({ failedLinks: 5, stopped: true, updated: 0 }),
    );
    expect(
      await db.medicineCatalogItem.count({ where: { priceMinor: 900000n } }),
    ).toBe(7);
  });

  it("si Remedios cae, AlfaBeta se actualiza igual", async () => {
    await service.importRecords([
      product({
        priceSource: "preciosderemedios",
        referenceUrl: remedies,
        sourceRow: "ZOLOM 10mg Comp. x 30",
      } as never),
      product({
        externalKey: "ab-2",
        priceSource: "alfabeta",
        presentation: "sin sabor pote x300 g",
        priceMinor: 3990000,
        referenceUrl: "https://www.alfabeta.net/precio/glutamina.html?idL=911",
        sourceRow: "sin sabor pote x300 g",
        barcodes: [],
      } as never),
    ]);
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("caída")) as unknown as typeof fetch;
    alfabeta.page.mockResolvedValue({
      name: "GLUTAMINA",
      presentations: [
        {
          presentation: "sin sabor pote x300 g (VL)",
          priceMinor: 4200000,
          updatedAt: null,
        },
      ],
    });
    await service.refreshLinkedSources();
    expect(alfabeta.page).toHaveBeenCalledWith(
      "https://www.alfabeta.net/precio/glutamina.html?idL=911",
    );
    const item = await db.medicineCatalogItem.findUniqueOrThrow({
      where: { externalKey: "ab-2" },
    });
    expect(item.priceMinor).toBe(4200000n);
  });
});
