import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContextoPreventa, PedidoPreventa } from "./lib/preventa-api";
import { DetalleOferta } from "./preventa-nuevo-pedido";
import { DialogoEntrega } from "./preventa-pedido-detalle";
import { Interruptor, Pastilla, Segmento } from "./preventa-ui";

const contexto = {
  configured: true,
  permisos: {
    vender: false,
    repartir: true,
    administrar: false,
    verSaldos: false,
  },
  usuario: { id: "u", nombre: "Repartidor", commissionRateBps: 0 },
  ajustes: {
    deliveryEffect: "SALE",
    sellerCanChangePrice: false,
    showStock: true,
    allowOutOfStock: true,
    applyOffers: true,
    receiptNote: null,
  },
  comprobante: {
    farmacia: "Farmacia",
    sucursal: "",
    direccion: "",
    telefono: "",
  },
} satisfies ContextoPreventa;

const pedido = {
  id: "p",
  number: 3,
  status: "IN_DELIVERY",
  customerName: "Kiosco Pepe",
  customerCreditEnabled: false,
  totalMinor: "250000",
  paidMinor: "0",
} as unknown as PedidoPreventa;

describe("piezas de la preventa", () => {
  it("la pastilla de estado lleva texto, no sólo color", () => {
    expect(
      renderToStaticMarkup(<Pastilla tono="aviso">Pendiente</Pastilla>),
    ).toContain("Pendiente");
  });

  it("el segmento marca la opción elegida para lectores de pantalla", () => {
    const html = renderToStaticMarkup(
      <Segmento
        etiqueta="Estado"
        valor="b"
        onChange={() => undefined}
        opciones={[
          { id: "a", label: "Todos" },
          { id: "b", label: "Pendientes", contador: 2 },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Estado"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain("Pendientes");
  });

  it("el interruptor es un switch con nombre", () => {
    const html = renderToStaticMarkup(
      <Interruptor label="Ve el stock" checked onChange={() => undefined} />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Ve el stock"');
    expect(html).toContain('aria-checked="true"');
  });

  it("el detalle de una oferta muestra qué dice y el precio con oferta", () => {
    const html = renderToStaticMarkup(
      <DetalleOferta
        producto={{
          id: "x",
          name: "Gaseosa",
          brand: null,
          presentation: null,
          hasImage: false,
          imageVersion: null,
          priceMinor: "100000",
          stock: 10,
          inStock: true,
          ofertas: [],
        }}
        oferta={{
          id: "o",
          label: "2x1",
          corta: "2x1",
          detalle: ["Llevando 2 pagás 1"],
          porCantidad: { cantidad: 2, precioUnitarioMinor: "50000" },
        }}
      />,
    );
    expect(html).toContain("2x1");
    expect(html).toContain("Llevando 2 pagás 1");
    expect(html).toContain("Cada una llevando 2");
  });

  it("al entregar como venta explica a dónde va el cobro", () => {
    const html = renderToStaticMarkup(
      <DialogoEntrega
        pedido={pedido}
        contexto={contexto}
        onClose={() => undefined}
        onConfirmar={async () => undefined}
      />,
    );
    expect(html).toContain("Pagó todo");
    expect(html).toContain("Cobros pendientes");
    expect(html).toContain("Confirmar entrega");
  });
});
