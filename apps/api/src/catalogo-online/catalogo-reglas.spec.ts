import {
  categoriasConRuta,
  huellaDelPedido,
  precioDeCatalogo,
  repartirEntrega,
  siguienteEstado,
  slugDesdeNombre,
  slugValido,
  totalDelPedido,
  unirRenglones,
} from "./catalogo-reglas";

describe("catálogo online: reglas", () => {
  describe("estados del pedido", () => {
    it("la farmacia confirma o rechaza un pedido recibido", () => {
      expect(siguienteEstado("RECEIVED", "confirmar")).toBe("CONFIRMED");
      expect(siguienteEstado("RECEIVED", "rechazar")).toBe("REJECTED");
    });

    it("sólo se entrega un pedido confirmado", () => {
      expect(siguienteEstado("CONFIRMED", "entregar")).toBe("DELIVERED");
      expect(siguienteEstado("RECEIVED", "entregar")).toBeNull();
    });

    it("el cliente no cancela un pedido ya confirmado", () => {
      expect(siguienteEstado("RECEIVED", "cancelar")).toBe("CANCELLED");
      expect(siguienteEstado("CONFIRMED", "cancelar")).toBeNull();
    });

    it("un pedido cerrado no cambia más", () => {
      for (const estado of ["REJECTED", "DELIVERED", "CANCELLED"] as const)
        for (const accion of [
          "confirmar",
          "rechazar",
          "entregar",
          "cancelar",
        ] as const)
          expect(siguienteEstado(estado, accion)).toBeNull();
    });
  });

  describe("dirección pública", () => {
    it("acepta minúsculas, números y guiones simples", () => {
      expect(slugValido("farmacia-perez-2")).toBe(true);
      expect(slugValido("Farmacia")).toBe(false);
      expect(slugValido("farmacia--perez")).toBe(false);
      expect(slugValido("-farmacia")).toBe(false);
      expect(slugValido("ab")).toBe(false);
    });

    it("propone una dirección desde el nombre, sin tildes", () => {
      expect(slugDesdeNombre("Farmacia Pérez & Hijos")).toBe(
        "farmacia-perez-hijos",
      );
      expect(slugValido(slugDesdeNombre("Ñ"))).toBe(true);
    });
  });

  describe("precio", () => {
    const precios = new Map([
      ["general", 1000n],
      ["respaldo", 900n],
    ]);

    it("usa la lista elegida, después la de respaldo y después Precio general", () => {
      expect(
        precioDeCatalogo(new Map([...precios, ["mayorista", 800n]]), {
          elegida: "mayorista",
          respaldo: "respaldo",
          general: "general",
        }),
      ).toBe(800n);
      expect(
        precioDeCatalogo(precios, {
          elegida: "mayorista",
          respaldo: "respaldo",
          general: "general",
        }),
      ).toBe(900n);
      expect(
        precioDeCatalogo(precios, { elegida: "mayorista", general: "general" }),
      ).toBe(1000n);
    });

    it("sin precio en ninguna lista, el producto no se ofrece", () => {
      expect(precioDeCatalogo(new Map(), { elegida: "general" })).toBeNull();
    });
  });

  describe("armado del pedido", () => {
    it("junta el mismo producto pedido dos veces", () => {
      expect(
        unirRenglones([
          { productId: "a", quantity: 1 },
          { productId: "b", quantity: 2 },
          { productId: "a", quantity: 3 },
        ]),
      ).toEqual([
        { productId: "a", quantity: 4 },
        { productId: "b", quantity: 2 },
      ]);
    });

    it("suma el total en centavos", () => {
      expect(
        totalDelPedido([
          { quantity: 3, unitPriceMinor: 1999n },
          { quantity: 1, unitPriceMinor: 5n },
        ]),
      ).toBe(6002n);
    });

    it("la huella no depende del orden de los renglones", () => {
      const base = { delivery: "PICKUP", notes: " a la tarde " };
      expect(
        huellaDelPedido({
          ...base,
          items: [
            { productId: "a", quantity: 1 },
            { productId: "b", quantity: 2 },
          ],
        }),
      ).toBe(
        huellaDelPedido({
          ...base,
          notes: "a la tarde",
          items: [
            { productId: "b", quantity: 2 },
            { productId: "a", quantity: 1 },
          ],
        }),
      );
      expect(
        huellaDelPedido({ ...base, items: [{ productId: "a", quantity: 1 }] }),
      ).not.toBe(
        huellaDelPedido({ ...base, items: [{ productId: "a", quantity: 2 }] }),
      );
    });
  });

  it("arma la ruta de las categorías como en la gestión", () => {
    const todas = [
      { id: "r", name: "Cuidado personal", parentId: null, active: true },
      { id: "a", name: "Accesorios", parentId: "r", active: true },
      { id: "s", name: "Shampoo", parentId: "c", active: true },
      { id: "c", name: "Cabello", parentId: "r", active: true },
      { id: "x", name: "Vieja", parentId: null, active: false },
    ];
    expect(categoriasConRuta(todas, new Set(["a", "s", "x"]))).toEqual([
      { id: "a", name: "Cuidado personal › Accesorios" },
      { id: "s", name: "Cuidado personal › Cabello › Shampoo" },
    ]);
  });

  describe("descuento de stock al entregar", () => {
    const ahora = new Date("2026-11-15T12:00:00Z");
    const lotes = [
      { id: "tarde", quantity: 5, expiresAt: new Date("2028-01-01") },
      { id: "vencido", quantity: 9, expiresAt: new Date("2026-01-01") },
      { id: "pronto", quantity: 2, expiresAt: new Date("2027-01-01") },
      { id: "sin-fecha", quantity: 4, expiresAt: null },
    ];

    it("saca primero lo que vence antes y nunca de un lote vencido", () => {
      expect(repartirEntrega(lotes, 4, ahora)).toEqual({
        salidas: [
          { lotId: "pronto", quantity: 2 },
          { lotId: "tarde", quantity: 2 },
        ],
        faltante: 0,
      });
    });

    it("informa lo que falta en lugar de dejar stock negativo", () => {
      expect(repartirEntrega(lotes, 20, ahora).faltante).toBe(9);
    });
  });
});
