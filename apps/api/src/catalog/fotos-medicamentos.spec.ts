import { elegirFoto, type FotoMedicamento } from "./fotos-medicamentos";
import { farmaciasHabilitadas } from "./fotos-medicamentos.service";

function jpeg(width = 800, height = 600) {
  const bytes = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0, 0xff, 0xda, 0,
    8, 1, 1, 0, 0, 63, 0, 0xff, 0xd9,
  ]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return new Uint8Array(bytes);
}

const IBU = "07798420160383";
const OTRO = "07791234567898";

function foto(cambios: Partial<FotoMedicamento> = {}): FotoMedicamento {
  return {
    gtin14: IBU,
    source: "public_farmalife",
    sourceRef: "https://www.farmalife.com.ar/ibu/p",
    sha256: "a".repeat(64),
    foto: jpeg(),
    prioridad: 2,
    ...cambios,
  };
}

const producto = { id: "p", organizationId: "o", gtins: [IBU, OTRO] };

describe("fotos de medicamentos (SISTEMA-122)", () => {
  it("pone la foto del código que coincide con la base", () => {
    const elegida = elegirFoto(producto, [foto()]);
    expect(elegida?.gtin14).toBe(IBU);
    expect(elegida?.source).toBe("public_farmalife");
    expect(elegida?.content.length).toBe(jpeg().length);
  });

  it("no usa una foto de otro código", () => {
    expect(
      elegirFoto({ ...producto, gtins: [OTRO] }, [foto({ gtin14: IBU })]),
    ).toBeNull();
  });

  it("no usa Farmacorp ni tiendas desconocidas", () => {
    expect(
      elegirFoto(producto, [
        foto({ source: "public_farmacorp" }),
        foto({ source: "openbeauty" }),
      ]),
    ).toBeNull();
  });

  it("prefiere la ficha no medicinal y después el código principal", () => {
    const elegida = elegirFoto(producto, [
      foto({ gtin14: IBU, prioridad: 2, source: "public_farmaplus" }),
      foto({ gtin14: OTRO, prioridad: 1, source: "public_farmar" }),
    ]);
    expect(elegida?.source).toBe("public_farmar");
    const principal = elegirFoto(producto, [
      foto({ gtin14: OTRO, source: "public_farmar" }),
      foto({ gtin14: IBU, source: "public_farmaplus" }),
    ]);
    expect(principal?.gtin14).toBe(IBU);
  });

  it("saltea una foto que no pasa la validación de las fotos subidas", () => {
    const elegida = elegirFoto(producto, [
      foto({ foto: jpeg(2000), source: "public_farmaplus" }),
      foto({ foto: new Uint8Array([1, 2, 3]), source: "public_farmaplus" }),
      foto({ gtin14: OTRO, source: "public_farmamix" }),
    ]);
    expect(elegida?.source).toBe("public_farmamix");
  });

  it("toma sólo identificadores válidos de farmacias habilitadas", () => {
    expect(
      farmaciasHabilitadas(
        " 11111111-1111-4111-8111-111111111111 ,x,,22222222-2222-4222-8222-222222222222",
      ),
    ).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(farmaciasHabilitadas(undefined)).toEqual([]);
  });
});
