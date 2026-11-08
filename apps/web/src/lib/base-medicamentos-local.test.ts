import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import {
  buscarMedicamentosEnLaPc,
  enviarExhibidoresPendientes,
  exhibidoresEnLaPc,
  guardarBaseMedicamentos,
  guardarExhibidorPendiente,
  medicamentosPorCodigo,
  olvidarIndice,
  versionBaseMedicamentos,
  type MedicamentoBase,
} from "./base-medicamentos-local";

const fila = (
  n: string,
  p: string,
  b: string[],
  extra: Partial<MedicamentoBase> = {},
): MedicamentoBase => ({
  n,
  p,
  l: "Bayer",
  d: "",
  f: "",
  s: "Venta libre",
  t: "",
  o: "official",
  pr: "150000",
  u: "2026-11-08T12:00:00.000Z",
  b,
  ...extra,
});

describe("base de medicamentos en la PC", () => {
  beforeEach(async () => {
    usarAlmacen(almacenEnMemoria());
    olvidarIndice();
    await guardarBaseMedicamentos({
      version: "v1",
      items: [
        fila("Buscapina Compositum", "comp. x 20", ["7795345000001"]),
        fila("Sertal Compuesto", "comp. rec. x 10", ["7795345124001"], {
          d: "Propinox",
        }),
        fila("Ibuprofeno Sertal", "x 10", ["7790000000002"]),
      ],
      packs: [
        { barcode: "7795345124247", baseBarcode: "7795345124001", factor: 20 },
      ],
    });
  });

  it("busca como el servidor: todas las palabras, sin acentos y primero el nombre que empieza igual", async () => {
    const encontrados = await buscarMedicamentosEnLaPc("SÉRTAL");
    expect(encontrados.map((m) => m.name)).toEqual([
      "Sertal Compuesto",
      "Ibuprofeno Sertal",
    ]);
    expect(encontrados[0]).toMatchObject({
      barcode: "7795345124001",
      priceMinor: 150000,
      prescriptionRequired: false,
    });
    expect(
      (await buscarMedicamentosEnLaPc("sertal propinox")).map((m) => m.name),
    ).toEqual(["Sertal Compuesto"]);
    expect(await versionBaseMedicamentos()).toBe("v1");
  });

  it("encuentra por código de barras", async () => {
    expect(
      (await buscarMedicamentosEnLaPc("7795345000001")).map((m) => m.name),
    ).toEqual(["Buscapina Compositum"]);
    expect(await medicamentosPorCodigo("0000000000")).toEqual([]);
  });

  it("un exhibidor armado sin conexión se usa enseguida y se manda una sola vez", async () => {
    await guardarExhibidorPendiente("o1", {
      barcode: "7795345121529",
      baseBarcode: "7795345124001",
      factor: 10,
    });
    expect(
      (await exhibidoresEnLaPc(["7795345121529", "7795345124247"])).map(
        (pack) => pack.factor,
      ),
    ).toEqual([20, 10]);
    const enviar = vi.fn(async () => {});
    await enviarExhibidoresPendientes(enviar, () => false);
    await enviarExhibidoresPendientes(enviar, () => false);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith("o1", {
      barcode: "7795345121529",
      baseBarcode: "7795345124001",
      factor: 10,
    });
  });

  it("si se corta al mandar el exhibidor, queda para la próxima", async () => {
    await guardarExhibidorPendiente("o1", {
      barcode: "7795345121529",
      baseBarcode: "7795345124001",
      factor: 10,
    });
    const sinRed = new Error("sin red");
    await enviarExhibidoresPendientes(
      async () => {
        throw sinRed;
      },
      (error) => error === sinRed,
    );
    expect(await exhibidoresEnLaPc(["7795345121529"])).toHaveLength(1);
  });
});
