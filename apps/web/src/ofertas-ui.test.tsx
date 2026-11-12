import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogProduct } from "./lib/api";
import type { DetalleOferta } from "./lib/ofertas-api";
import type { OfertaMotor } from "./lib/ofertas-motor";
import { OfertaEditor } from "./oferta-editor";
import { OfertaDetalle, EstadoOfertaBadge } from "./ofertas-workspace";
import { accionesDe } from "./lib/ofertas-estados";
import { ProductOffersCard } from "./product-offers-card";
import { PreciosOferta } from "./oferta-precios";
import { SaleCartOffers } from "./sale-cart-offers";
import { SaleProductDetail } from "./sale-product-detail";
import { OfertaAccionDialog } from "./oferta-accion-dialog";
import { BotonConAyuda } from "./boton-con-ayuda";
import { SaleCatalogTable } from "./sale-catalog-table";
import { SaleCurrentPanel } from "./sale-current-panel";

const detalle: DetalleOferta = {
  id: "o1",
  name: "2x1 shampoo",
  type: "BUY_X_PAY_Y",
  label: "2x1",
  status: "PUBLISHED",
  estado: "ACTIVA",
  version: 2,
  priority: 0,
  combinable: false,
  startsAt: "2026-11-10T03:00:00.000Z",
  endsAt: null,
  weekdays: 4,
  dayStartMinute: 540,
  dayEndMinute: 720,
  allBranches: true,
  branchIds: [],
  allPriceLists: true,
  priceListIds: [],
  productKind: "ALL",
  maxUnitsPerSale: null,
  maxUnitsTotal: 100,
  unitsUsed: 6,
  percentBps: null,
  amountMinor: null,
  fixedPriceMinor: null,
  buyQuantity: 2,
  payQuantity: 1,
  nthUnit: null,
  bundlePriceMinor: null,
  tiers: [],
  targets: [
    {
      kind: "PRODUCT",
      id: "p1",
      name: "Shampoo",
      exclude: false,
      quantity: null,
    },
  ],
  alcance: "Shampoo",
  createdAt: "2026-11-10T03:00:00.000Z",
  updatedAt: "2026-11-10T03:00:00.000Z",
  stats: {
    ventas: 3,
    unidades: 6,
    descuentoMinor: "300000",
    facturacionMinor: "300000",
  },
  historial: [
    {
      id: "a1",
      action: "OFFER_UPDATED",
      createdAt: "2026-11-10T15:00:00.000Z",
      actor: "Carla",
      before: { name: "2x1", payQuantity: 1 },
      after: { name: "2x1 shampoo", payQuantity: 1 },
    },
  ],
  ventas: [
    {
      saleId: "s1",
      number: "ABCD1234",
      branchName: "Central",
      completedAt: "2026-11-10T15:00:00.000Z",
      status: "COMPLETED",
      totalMinor: "100000",
      units: 2,
      discountMinor: "100000",
      offerVersion: 1,
    },
  ],
};

describe("apartado Ofertas", () => {
  it("el alta muestra cada tipo con su descripción y ejemplo", () => {
    const html = renderToStaticMarkup(
      <OfertaEditor
        token="t"
        organizationId="o"
        products={[]}
        branches={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(html).toContain("Nueva oferta");
    expect(html).toContain("Lleva y paga (NxM)");
    expect(html).toContain("2da al 50%, 2da al 70%.");
    expect(html).toContain("Combo");
    expect(html).toContain('aria-label="Nombre de la oferta"');
    expect(html).toContain("Resumen");
  });

  it("la edición abre con los datos de la oferta", () => {
    const html = renderToStaticMarkup(
      <OfertaEditor
        token="t"
        organizationId="o"
        oferta={detalle}
        products={[]}
        branches={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(html).toContain("Editar oferta");
    expect(html).toContain('value="2x1 shampoo"');
  });

  it("el detalle muestra ventas, historial con cambios y acciones según el estado", () => {
    const html = renderToStaticMarkup(
      <OfertaDetalle
        oferta={detalle}
        branches={[]}
        canManage
        busy={false}
        onClose={() => {}}
        onEdit={() => {}}
        onAction={() => {}}
      />,
    );
    expect(html).toContain("Ventas con la oferta");
    expect(html).toContain("#ABCD1234");
    expect(html).toContain("Historial de cambios");
    expect(html).toContain("Edición");
    expect(html).toContain("(name)");
    expect(html).toContain("Stock de oferta: 6 de 100");
    expect(html).toContain("Pausar");
    expect(accionesDe({ status: "PAUSED" })).toContain("reanudar");
    expect(accionesDe({ status: "ARCHIVED" })).toEqual(["duplicar"]);
    expect(
      renderToStaticMarkup(<EstadoOfertaBadge estado="PROGRAMADA" />),
    ).toContain("Programada");
  });
});

describe("ofertas en Ventas y Productos", () => {
  it("el catálogo de Ventas marca los productos en oferta", () => {
    const html = renderToStaticMarkup(
      <SaleCatalogTable
        token="t"
        organizationId="o"
        idPrefix="c"
        onSelect={() => {}}
        onAdd={() => {}}
        rows={[
          {
            product: {
              id: "p1",
              name: "Shampoo",
              activeIngredient: null,
              concentration: null,
              pharmaceuticalForm: null,
              presentation: null,
              barcodes: [],
              category: null,
              prices: [{ amountMinor: "100000" }],
            } as unknown as CatalogProduct,
            available: 5,
            expired: 0,
            offer: "2x1",
          },
        ]}
      />,
    );
    expect(html).toContain("2x1");
  });

  it("el pie muestra el ahorro por ofertas y el aviso de agregar uno más", () => {
    const html = renderToStaticMarkup(
      <SaleCurrentPanel
        lineCount={1}
        unitCount={2}
        totalMinor={200000}
        offerSavingsMinor={100000}
        offerNotice={<p>Agregá 1 más y llevás 3x2</p>}
        submitting={false}
        checkoutDisabled={false}
        context={<span />}
        lines={<div />}
        discount={<span />}
        onClear={() => {}}
        onCheckout={() => {}}
      />,
    );
    expect(html).toContain("Ahorro por ofertas");
    expect(html).toContain("Agregá 1 más y llevás 3x2");
  });

  it("Productos muestra las ofertas del producto con acceso al apartado", () => {
    const oferta = { id: "o1", name: "Martes 10%" } as OfertaMotor;
    const html = renderToStaticMarkup(
      <ProductOffersCard
        ofertas={[{ oferta, estado: "ACTIVA", label: "Martes -10%" }]}
        onOpen={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(html).toContain("Martes -10%");
    expect(html).toContain("Vigente");
    expect(html).toContain("Ver en Ofertas");
    expect(html).toContain("Crear oferta para este producto");
  });
});

describe("vista previa de precios en el alta", () => {
  const producto = (id: string, precio: string) =>
    ({
      id,
      name: id,
      prices: [{ amountMinor: precio }],
    }) as unknown as CatalogProduct;
  const destino = (id: string, quantity = "") => ({
    kind: "PRODUCT" as const,
    id,
    name: `Producto ${id}`,
    exclude: false,
    quantity,
  });

  it("muestra el precio de lista y cuánto queda con la oferta", () => {
    const html = renderToStaticMarkup(
      <PreciosOferta
        entrada={{
          name: "Veinte",
          type: "PERCENT",
          percentBps: 2000,
          startsAt: "2026-11-10T12:00:00.000Z",
          targets: [{ kind: "PRODUCT", id: "a" }],
        }}
        etiqueta="-20%"
        destinos={[destino("a")]}
        productosPorId={new Map([["a", producto("a", "1000000")]])}
        precioEjemplo="10000"
        onPrecioEjemplo={() => {}}
      />,
    );
    expect(html).toContain("Producto a");
    expect(html).toContain("$10.000");
    expect(html).toContain("$8.000");
    expect(html).toContain("−20%");
  });

  it("en un combo muestra cada producto, el precio de lista y el del combo", () => {
    const html = renderToStaticMarkup(
      <PreciosOferta
        entrada={{
          name: "Combo",
          type: "BUNDLE",
          bundlePriceMinor: "900000",
          startsAt: "2026-11-10T12:00:00.000Z",
          targets: [
            { kind: "PRODUCT", id: "a", quantity: 1 },
            { kind: "PRODUCT", id: "b", quantity: 1 },
          ],
        }}
        destinos={[destino("a", "1"), destino("b", "1")]}
        productosPorId={
          new Map([
            ["a", producto("a", "600000")],
            ["b", producto("b", "500000")],
          ])
        }
        precioEjemplo=""
        onPrecioEjemplo={() => {}}
      />,
    );
    expect(html).toContain("Precio de lista del combo");
    expect(html).toContain("$11.000");
    expect(html).toContain("Con la oferta");
    expect(html).toContain("$9.000");
  });

  it("sin descuento completo muestra igual el precio del producto", () => {
    const html = renderToStaticMarkup(
      <PreciosOferta
        entrada={null}
        destinos={[destino("a")]}
        productosPorId={new Map([["a", producto("a", "1250000")]])}
        precioEjemplo=""
        onPrecioEjemplo={() => {}}
      />,
    );
    expect(html).toContain("$12.500");
    expect(html).toContain("Completá el descuento");
  });
});

describe("ofertas en el carrito de Ventas", () => {
  it("una línea por oferta: qué falta, completar y descartar", () => {
    const html = renderToStaticMarkup(
      <SaleCartOffers
        onCerrarAviso={() => {}}
        onDescartar={() => {}}
        sugerencias={[
          {
            id: "c1",
            label: "Combo",
            nombre: "Combo pelo",
            agregar: "Agregá Acondicionador",
            gana: "y ahorrás $2.000 (18%) con «Combo pelo»",
            combo: true,
            componentes: [
              { nombre: "Shampoo", cantidad: 1, enCarrito: 1 },
              { nombre: "Acondicionador", cantidad: 1, enCarrito: 0 },
            ],
            accion: { texto: "Completar", onClick: () => {} },
          },
          {
            id: "o2",
            label: "3x2",
            nombre: "3x2 jabón",
            agregar: "Agregá 1 más",
            gana: "y te llevás 1 gratis (3x2)",
            accion: { texto: "Agregar 1", onClick: () => {} },
          },
        ]}
      />,
    );
    // Pasador de alto fijo: se ve una por vez, con flechas y contador.
    expect(html).toContain("h-[60px]");
    expect(html).toContain("Agregá Acondicionador");
    expect(html).toContain("y ahorrás $2.000 (18%) con «Combo pelo»");
    expect(html).not.toContain("y te llevás 1 gratis (3x2)");
    expect(html).toContain("1/2");
    expect(html).toContain('aria-label="Oferta siguiente"');
    expect(html).toContain("Completar");
    expect(html).toContain('aria-label="Descartar Combo pelo"');
    expect(html).not.toContain(">Ofertas<");
  });

  it("con una sola oferta no muestra el pasador", () => {
    const html = renderToStaticMarkup(
      <SaleCartOffers
        onCerrarAviso={() => {}}
        onDescartar={() => {}}
        sugerencias={[
          {
            id: "o2",
            label: "3x2",
            nombre: "3x2 jabón",
            agregar: "Agregá 1 más",
            gana: "y te llevás 1 gratis (3x2)",
          },
        ]}
      />,
    );
    expect(html).toContain("y te llevás 1 gratis (3x2)");
    expect(html).not.toContain("Oferta siguiente");
  });

  it("sin ofertas ni avisos no ocupa lugar", () => {
    expect(
      renderToStaticMarkup(
        <SaleCartOffers
          onCerrarAviso={() => {}}
          onDescartar={() => {}}
          sugerencias={[]}
        />,
      ),
    ).toBe("");
  });
});

describe("confirmación de acciones", () => {
  it("explica qué pasa al finalizar, con el estilo del sistema", () => {
    const html = renderToStaticMarkup(
      <OfertaAccionDialog
        oferta={{ name: "2x1 shampoo", label: "2x1" }}
        accion="finalizar"
        onConfirm={async () => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Finalizar oferta");
    expect(html).toContain("no se puede reanudar");
    expect(html).toContain("duplicala");
    expect(html).toContain("Finalizar ya");
    expect(html).toContain("Volver");
    expect(html).toContain("2x1 shampoo");
  });

  it("archivar aclara que no se borra", () => {
    const html = renderToStaticMarkup(
      <OfertaAccionDialog
        oferta={{ name: "Martes", label: "Martes -10%" }}
        accion="archivar"
        onConfirm={async () => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("No se borra");
  });
});

describe("ayuda de los botones de acción", () => {
  it("no usa el aviso del navegador y describe la acción para lectores", () => {
    const html = renderToStaticMarkup(
      <BotonConAyuda
        label="Pausar 2x1 shampoo"
        title="Pausar"
        description="Deja de aplicarse hasta que la reanudes."
        icon={() => null}
        onClick={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Pausar 2x1 shampoo"');
    expect(html).toContain('aria-description="Deja de aplicarse');
    expect(html).not.toContain("title=");
  });
});

describe("bloque del producto en Ventas con oferta", () => {
  const producto = {
    id: "p1",
    name: "Shampoo",
    activeIngredient: null,
    concentration: null,
    pharmaceuticalForm: null,
    presentation: null,
    barcodes: [],
    category: null,
    prices: [{ amountMinor: "600000" }],
  } as unknown as CatalogProduct;
  const props = {
    token: "t",
    organizationId: "o",
    product: producto,
    available: 5,
    quantity: 1,
    onQuantityChange: () => {},
    onAdd: () => {},
    onClear: () => {},
    onFinished: () => {},
    onInvalid: () => {},
  };

  it("con combo muestra primero la oferta, lo que incluye y cómo volver a la foto", () => {
    const html = renderToStaticMarkup(
      <SaleProductDetail
        {...props}
        onAddCombo={() => {}}
        ofertas={[
          {
            id: "c1",
            label: "Combo",
            nombre: "Combo pelo",
            texto: "1 × Shampoo + 1 × Acondicionador",
            combo: {
              componentes: [
                {
                  productId: "p1",
                  nombre: "Shampoo",
                  cantidad: 1,
                  precioMinor: 600000,
                },
                {
                  productId: "p2",
                  nombre: "Acondicionador",
                  cantidad: 1,
                  precioMinor: 500000,
                },
              ],
              listaMinor: 1100000,
              comboMinor: 900000,
            },
          },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Oferta del producto"');
    expect(html).toContain('aria-label="Productos del combo"');
    expect(html).toContain("Acondicionador");
    expect(html).toContain("Ahorrás");
    expect(html).toContain("Agregar combo");
    expect(html).toContain("Ver producto");
    expect(html).toContain("h-[108px]");
  });

  it("sin ofertas muestra la cara del producto de siempre", () => {
    const html = renderToStaticMarkup(<SaleProductDetail {...props} />);
    expect(html).toContain('aria-label="Producto elegido"');
    expect(html).not.toContain("Ver producto");
  });
});
