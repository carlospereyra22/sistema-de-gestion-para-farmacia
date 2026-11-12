import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogProduct } from "./lib/api";
import type { DetalleOferta } from "./lib/ofertas-api";
import type { OfertaMotor } from "./lib/ofertas-motor";
import { OfertaEditor } from "./oferta-editor";
import { OfertaDetalle, EstadoOfertaBadge } from "./ofertas-workspace";
import { accionesDe } from "./lib/ofertas-estados";
import { ProductOffersCard } from "./product-offers-card";
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
