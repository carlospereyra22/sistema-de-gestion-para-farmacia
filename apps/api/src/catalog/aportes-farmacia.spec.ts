import {
  ambienteAportes,
  aportesDelProducto,
  fichaDeAporte,
  gtinAportable,
  rutaDeCategoria,
  type ProductoParaAporte,
} from "./aportes-farmacia";
import { urlAportes } from "./aportes-farmacia.service";

const producto = (
  cambios: Partial<ProductoParaAporte> = {},
): ProductoParaAporte => ({
  productId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  nombre: "  Shampoo   Suave Manzanilla ",
  marca: "Suave",
  presentacion: "930 ml",
  esMedicamento: false,
  activo: true,
  codigos: ["7791293022925"],
  categoriaRuta: ["Cuidado personal", "Cabello"],
  foto: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  ...cambios,
});

describe("aportes de las farmacias al catálogo externo", () => {
  it("aporta nombre, marca, presentación, categoría y foto de un código válido", () => {
    const aportes = aportesDelProducto(producto());
    expect(aportes).toHaveLength(1);
    const aporte = aportes[0]!;
    expect(aporte).toMatchObject({
      gtin14: "07791293022925",
      nombre: "Shampoo Suave Manzanilla",
      marca: "Suave",
      presentacion: "930 ml",
      categoriaRuta: ["Cuidado personal", "Cabello"],
    });
    expect(aporte.fotoSha256).toMatch(/^[0-9a-f]{64}$/);
    // Nunca viajan precio, stock ni costos: no existen en el aporte.
    expect(Object.keys(aporte).sort()).toEqual(
      [
        "categoriaRuta",
        "foto",
        "fotoSha256",
        "gtin14",
        "marca",
        "nombre",
        "organizationId",
        "presentacion",
        "productId",
      ].sort(),
    );
  });

  it("no aporta medicamentos, productos dados de baja ni códigos que no son GTIN", () => {
    expect(aportesDelProducto(producto({ esMedicamento: true }))).toEqual([]);
    expect(aportesDelProducto(producto({ activo: false }))).toEqual([]);
    expect(aportesDelProducto(producto({ nombre: " " }))).toEqual([]);
    expect(
      aportesDelProducto(
        producto({
          codigos: ["SG000000000123", "7791293022926", "2000000000008"],
        }),
      ),
    ).toEqual([]);
  });

  it("aporta una vez por código, aunque se repita escrito distinto", () => {
    const aportes = aportesDelProducto(
      producto({ codigos: ["7791293022925", "07791293022925", "96385074"] }),
    );
    expect(aportes.map((aporte) => aporte.gtin14).sort()).toEqual([
      "00000096385074",
      "07791293022925",
    ]);
  });

  it("valida el ambiente y el código", () => {
    expect(ambienteAportes(" Produccion ")).toBe("produccion");
    expect(ambienteAportes("")).toBeUndefined();
    expect(ambienteAportes("prod; drop")).toBeUndefined();
    expect(gtinAportable("7791293022925")).toBe("07791293022925");
    expect(gtinAportable("123")).toBeUndefined();
  });

  it("arma la ruta de categorías desde la raíz y corta los ciclos", () => {
    const categorias = new Map([
      ["a", { name: "Cuidado personal", parentId: null }],
      ["b", { name: "Cabello", parentId: "a" }],
      ["x", { name: "X", parentId: "y" }],
      ["y", { name: "Y", parentId: "x" }],
    ]);
    expect(rutaDeCategoria("b", categorias)).toEqual([
      "Cuidado personal",
      "Cabello",
    ]);
    expect(rutaDeCategoria("x", categorias)).toEqual(["Y", "X"]);
    expect(rutaDeCategoria(null, categorias)).toEqual([]);
  });

  it("se ofrece con la forma de una ficha de tienda, sin decir qué farmacia lo cargó", () => {
    const ficha = fichaDeAporte({
      gtin14: "07791293022925",
      nombre: "Shampoo Suave Manzanilla",
      marca: "Suave",
      presentacion: "930 ml",
      categoria_ruta: ["Cuidado personal", "Cabello"],
      foto: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      foto_sha256: "a".repeat(64),
      actualizado: new Date("2026-11-22T12:00:00Z"),
    });
    expect(ficha).toMatchObject({
      code: "7791293022925",
      source: "farmacia",
      scope_group: "Cuidado personal",
      category_path: ["Cuidado personal", "Cabello"],
      subcategory: "Cabello",
      isMedication: false,
    });
    expect(ficha.image?.data_url).toBe("data:image/jpeg;base64,/9j/2Q==");
    expect(JSON.stringify(ficha)).not.toContain("2222");
    // La huella cambia si cambian los datos, para que la web no elija una ficha vieja.
    expect(
      fichaDeAporte({
        gtin14: "07791293022925",
        nombre: "Otro nombre",
        marca: "Suave",
        presentacion: "930 ml",
        categoria_ruta: [],
        foto: null,
        foto_sha256: null,
        actualizado: new Date(),
      }).fingerprint,
    ).not.toBe(ficha.fingerprint);
  });

  it("sólo acepta la URL de escritura hacia la base independiente local", () => {
    const docker = "postgresql://aportes@db:5432/catalogo_juncos_external";
    expect(urlAportes(docker, false)).toBeDefined();
    expect(urlAportes(docker, true)).toBeUndefined();
    expect(
      urlAportes(
        "postgresql://aportes@127.0.0.1:5432/catalogo_juncos_external",
        true,
      ),
    ).toBeDefined();
    expect(
      urlAportes("postgresql://aportes@127.0.0.1:5432/gestion_prod", true),
    ).toBeUndefined();
    expect(urlAportes("", false)).toBeUndefined();
  });
});
