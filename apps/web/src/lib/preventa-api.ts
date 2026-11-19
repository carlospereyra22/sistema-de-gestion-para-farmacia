import { apiFetch } from "./api-fetch";

/**
 * Preventa (SISTEMA-108): llamadas a `organizations/:id/preventa/...`. Las
 * consultas quedan en la copia local (se ven sin conexión); los pedidos que
 * se toman sin señal los manda la bandeja de salida (`preventa-bandeja.ts`).
 */

const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

export type EstadoPreventa =
  "PENDING" | "IN_DELIVERY" | "DELIVERED" | "CANCELLED";
export type EfectoEntrega = "NONE" | "STOCK" | "SALE";
export type EstadoCobro = "PAGADO" | "PARCIAL" | "SIN_PAGO";
export type MedioCobro = "CASH" | "TRANSFER" | "CARD";

export type ContextoPreventa = {
  configured: boolean;
  permisos: {
    vender: boolean;
    repartir: boolean;
    administrar: boolean;
    verSaldos: boolean;
  };
  usuario: { id: string; nombre: string; commissionRateBps: number };
  ajustes: {
    deliveryEffect: EfectoEntrega;
    sellerCanChangePrice: boolean;
    showStock: boolean;
    allowOutOfStock: boolean;
    applyOffers: boolean;
    receiptNote: string | null;
  };
  comprobante: {
    farmacia: string;
    sucursal: string;
    direccion: string;
    telefono: string;
  };
};

export type ConfiguracionPreventa = {
  exists: boolean;
  branchId: string;
  deliveryEffect: EfectoEntrega;
  sellerCanChangePrice: boolean;
  sellerSeesAllCustomers: boolean;
  showStock: boolean;
  allowOutOfStock: boolean;
  applyOffers: boolean;
  receiptNote: string | null;
  updatedAt: string | null;
};

export type MiembroEquipo = {
  userId: string;
  name: string;
  email: string;
  vende: boolean;
  reparte: boolean;
  commissionRateBps: number | null;
};

export type ClientePreventa = {
  id: string;
  name: string;
  document: string | null;
  address: string | null;
  reference: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  visitDays: number;
  sellerId: string | null;
  sellerName: string | null;
  priceListName: string | null;
  creditEnabled: boolean;
  balanceMinor: string | null;
  lastOrderAt: string | null;
};

export type DatosCliente = {
  address?: string | null;
  reference?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  visitDays?: number;
  sellerId?: string | null;
};

export type OfertaDeProducto = {
  id: string;
  label: string;
  corta: string;
  detalle: string[];
  precioOfertaMinor?: string | null;
  porCantidad?: { cantidad: number; precioUnitarioMinor: string } | null;
};

export type ProductoPreventa = {
  id: string;
  name: string;
  brand: string | null;
  presentation: string | null;
  hasImage: boolean;
  imageVersion: string | null;
  priceMinor: string | null;
  stock: number | null;
  inStock: boolean;
  ofertas: OfertaDeProducto[];
};

export type PaginaProductos = {
  total: number;
  pagina: number;
  porPagina: number;
  items: ProductoPreventa[];
};

export type OfertaVigente = {
  id: string;
  name: string;
  label: string;
  detalle: string[];
  vigenteAhora: boolean;
  endsAt: string | null;
  alcance: string[];
  minimoMinor: string | null;
};

export type RenglonPedido = {
  productId: string;
  quantity: number;
  unitPriceMinor?: string;
};

export type Cotizacion = {
  items: {
    productId: string;
    productName: string;
    quantity: number;
    listUnitPriceMinor: string;
    unitPriceMinor: string;
    discountMinor: string;
    totalMinor: string;
    stock: number | null;
    inStock: boolean;
    labels: string[];
  }[];
  noDisponibles: string[];
  sugerencias: {
    offerId: string;
    label: string;
    productIds: string[];
    faltan: number;
    mensaje: string;
  }[];
  ofertasDeLaCompra: {
    id: string;
    label: string;
    minimoMinor?: string;
    beneficio?: string;
  }[];
  aplicadas: {
    offerId: string;
    label: string;
    name: string;
    discountMinor: string;
  }[];
  ahorroMinor: string;
  totalMinor: string;
};

export type PedidoPreventa = {
  id: string;
  number: number;
  status: EstadoPreventa;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerCreditEnabled: boolean;
  deliveryAddress: string | null;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
  sellerId: string;
  sellerName: string | null;
  delivererId: string | null;
  delivererName: string | null;
  notes: string | null;
  deliveryNote: string | null;
  totalMinor: string;
  paidMinor: string;
  paymentStatus: EstadoCobro;
  deliveryEffect: EfectoEntrega | null;
  saleId: string | null;
  stockDeducted: boolean;
  cancelReason: string | null;
  commissionRateBps: number | null;
  commissionPaid: boolean;
  createdAt: string;
  assignedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    listUnitPriceMinor: string;
    unitPriceMinor: string;
    discountMinor: string;
    totalMinor: string;
  }[];
  offers: { label: string; name: string; discountMinor: string }[];
  payments: {
    method: MedioCobro | "ACCOUNT" | "OTHER";
    amountMinor: string;
    createdAt: string;
  }[];
};

export type ListaPedidos = {
  items: PedidoPreventa[];
  resumen: {
    cantidad: number;
    totalMinor: string;
    cobradoMinor: string;
    pendientes: number;
    enReparto: number;
  };
};

export type FiltroPedidos = {
  estado?: EstadoPreventa;
  vendedor?: string;
  repartidor?: string;
  cliente?: string;
  desde?: string;
  hasta?: string;
  mios?: boolean;
  repartir?: boolean;
};

export type ComisionesPreventa = {
  pendienteMinor: string;
  pagadoMinor: string;
  vendedores: {
    sellerId: string;
    sellerName: string;
    commissionRateBps: number;
    pendienteMinor: string;
    pagadoMinor: string;
    sinPorcentaje: number;
    pedidos: {
      orderId: string;
      number: number;
      customerName: string;
      deliveredAt: string | null;
      totalMinor: string;
      rateBps: number;
      origen: "PEDIDO" | "PREVENTISTA" | "SIN_PORCENTAJE";
      pagada: boolean;
      pagadaEl: string | null;
      commissionMinor: string;
    }[];
  }[];
};

export type ResumenPreventa = {
  pedidos: number;
  totalMinor: string;
  promedioMinor: string;
  clientes: number;
  entregados: number;
  entregadoMinor: string;
  cobradoMinor: string;
  porCobrarMinor: string;
  pendientes: number;
  porVendedor: {
    sellerId: string;
    sellerName: string;
    pedidos: number;
    totalMinor: string;
    clientes: number;
  }[];
  porDia: { dia: string; pedidos: number; totalMinor: string }[];
  productos: {
    productId: string;
    productName: string;
    cantidad: number;
    totalMinor: string;
  }[];
};

/** Error de la API con su código HTTP (409 = alguien lo cambió antes). */
export class ErrorPreventa extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function error(response: Response, fallback: string): Promise<Error> {
  try {
    const result = (await response.json()) as { message?: string | string[] };
    return new ErrorPreventa(
      Array.isArray(result.message)
        ? result.message.join(", ")
        : (result.message ?? fallback),
      response.status,
    );
  } catch {
    return new ErrorPreventa(fallback, response.status);
  }
}

const ruta = (organizationId: string, final: string) =>
  `${base}/organizations/${organizationId}/preventa/${final}`;

async function pedir<T>(
  token: string,
  organizationId: string,
  final: string,
  fallback: string,
  opciones: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await apiFetch(ruta(organizationId, final), {
    method: opciones.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(opciones.body !== undefined
      ? { body: JSON.stringify(opciones.body) }
      : {}),
  });
  if (!response.ok) throw await error(response, fallback);
  return (await response.json()) as T;
}

const consulta = (
  valores: Record<string, string | number | boolean | undefined>,
) => {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor === undefined || valor === "" || valor === false) continue;
    params.set(clave, valor === true ? "1" : String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : "";
};

export const preventaApi = {
  contexto: (t: string, o: string) =>
    pedir<ContextoPreventa>(t, o, "contexto", "No se pudo abrir la preventa."),
  configuracion: (t: string, o: string) =>
    pedir<ConfiguracionPreventa>(
      t,
      o,
      "configuracion",
      "No se pudo ver la configuración.",
    ),
  guardarConfiguracion: (
    t: string,
    o: string,
    datos: Omit<ConfiguracionPreventa, "exists" | "updatedAt">,
  ) =>
    pedir<ConfiguracionPreventa>(
      t,
      o,
      "configuracion",
      "No se pudo guardar la configuración.",
      {
        method: "PUT",
        body: datos,
      },
    ),
  equipo: (t: string, o: string) =>
    pedir<MiembroEquipo[]>(t, o, "equipo", "No se pudo ver el equipo."),
  comisionDelVendedor: (
    t: string,
    o: string,
    userId: string,
    commissionRateBps: number,
  ) =>
    pedir<{ userId: string; commissionRateBps: number }>(
      t,
      o,
      `equipo/${userId}/comision`,
      "No se pudo guardar la comisión.",
      { method: "PUT", body: { commissionRateBps } },
    ),
  clientes: (
    t: string,
    o: string,
    filtro: { q?: string; hoy?: boolean; vendedor?: string } = {},
  ) =>
    pedir<ClientePreventa[]>(
      t,
      o,
      `clientes${consulta(filtro)}`,
      "No se pudieron ver los clientes.",
    ),
  crearCliente: (
    t: string,
    o: string,
    datos: DatosCliente & { name: string; document?: string | null },
  ) =>
    pedir<{ id: string; name: string }>(
      t,
      o,
      "clientes",
      "No se pudo crear el cliente.",
      {
        method: "POST",
        body: datos,
      },
    ),
  guardarCliente: (
    t: string,
    o: string,
    customerId: string,
    datos: DatosCliente,
  ) =>
    pedir<{ customerId: string }>(
      t,
      o,
      `clientes/${customerId}`,
      "No se pudo guardar el cliente.",
      { method: "PUT", body: datos },
    ),
  productos: (
    t: string,
    o: string,
    filtro: {
      q?: string;
      cliente?: string;
      pagina?: number;
      ofertas?: boolean;
      conStock?: boolean;
    },
  ) =>
    pedir<PaginaProductos>(
      t,
      o,
      `productos${consulta(filtro)}`,
      "No se pudieron ver los productos.",
    ),
  ofertas: (t: string, o: string) =>
    pedir<OfertaVigente[]>(t, o, "ofertas", "No se pudieron ver las ofertas."),
  cotizar: (
    t: string,
    o: string,
    datos: { customerId?: string; items: RenglonPedido[] },
  ) =>
    pedir<Cotizacion>(t, o, "cotizar", "No se pudo calcular el pedido.", {
      method: "POST",
      body: datos,
    }),
  pedidos: (t: string, o: string, filtro: FiltroPedidos = {}) =>
    pedir<ListaPedidos>(
      t,
      o,
      `pedidos${consulta(filtro)}`,
      "No se pudieron ver los pedidos.",
    ),
  pedido: (t: string, o: string, id: string) =>
    pedir<PedidoPreventa>(t, o, `pedidos/${id}`, "No se pudo ver el pedido."),
  crearPedido: (
    t: string,
    o: string,
    datos: {
      requestId: string;
      customerId: string;
      items: RenglonPedido[];
      notes?: string | null;
    },
  ) =>
    pedir<PedidoPreventa>(t, o, "pedidos", "No se pudo guardar el pedido.", {
      method: "POST",
      body: datos,
    }),
  editarPedido: (
    t: string,
    o: string,
    id: string,
    datos: {
      expectedUpdatedAt: string;
      items: RenglonPedido[];
      notes?: string | null;
    },
  ) =>
    pedir<PedidoPreventa>(
      t,
      o,
      `pedidos/${id}`,
      "No se pudo guardar el pedido.",
      {
        method: "PUT",
        body: datos,
      },
    ),
  cancelar: (
    t: string,
    o: string,
    p: Pick<PedidoPreventa, "id" | "status">,
    reason: string,
  ) =>
    pedir<PedidoPreventa>(
      t,
      o,
      `pedidos/${p.id}/cancelar`,
      "No se pudo cancelar.",
      {
        method: "POST",
        body: { expectedStatus: p.status, reason },
      },
    ),
  asignar: (t: string, o: string, orderIds: string[], delivererId: string) =>
    pedir<{ asignados: number }>(
      t,
      o,
      "pedidos/asignar",
      "No se pudo pasar a reparto.",
      {
        method: "POST",
        body: { orderIds, delivererId },
      },
    ),
  quitarDelReparto: (
    t: string,
    o: string,
    p: Pick<PedidoPreventa, "id" | "status">,
  ) =>
    pedir<PedidoPreventa>(
      t,
      o,
      `pedidos/${p.id}/quitar-del-reparto`,
      "No se pudo quitar del reparto.",
      {
        method: "POST",
        body: { expectedStatus: p.status },
      },
    ),
  noEntregado: (
    t: string,
    o: string,
    p: Pick<PedidoPreventa, "id" | "status">,
    note: string,
  ) =>
    pedir<PedidoPreventa>(
      t,
      o,
      `pedidos/${p.id}/no-entregado`,
      "No se pudo registrar.",
      {
        method: "POST",
        body: { expectedStatus: p.status, note },
      },
    ),
  entregar: (
    t: string,
    o: string,
    p: Pick<PedidoPreventa, "id" | "status">,
    datos: { requestId: string; collectedMinor: string; method: MedioCobro },
  ) =>
    pedir<PedidoPreventa>(
      t,
      o,
      `pedidos/${p.id}/entregar`,
      "No se pudo entregar el pedido.",
      {
        method: "POST",
        body: { expectedStatus: p.status, ...datos },
      },
    ),
  cobrar: (
    t: string,
    o: string,
    id: string,
    datos: { requestId: string; amountMinor: string; method: MedioCobro },
  ) =>
    pedir<PedidoPreventa>(
      t,
      o,
      `pedidos/${id}/cobros`,
      "No se pudo registrar el cobro.",
      {
        method: "POST",
        body: datos,
      },
    ),
  comisionDelPedido: (
    t: string,
    o: string,
    id: string,
    commissionRateBps: number | null,
  ) =>
    pedir<{ orderId: string }>(
      t,
      o,
      `pedidos/${id}/comision`,
      "No se pudo cambiar la comisión.",
      {
        method: "PUT",
        body: { commissionRateBps },
      },
    ),
  comisiones: (
    t: string,
    o: string,
    filtro: { desde?: string; hasta?: string; vendedor?: string } = {},
  ) =>
    pedir<ComisionesPreventa>(
      t,
      o,
      `comisiones${consulta(filtro)}`,
      "No se pudieron ver las comisiones.",
    ),
  pagarComisiones: (
    t: string,
    o: string,
    datos: {
      requestId: string;
      sellerId: string;
      orderIds: string[];
      note?: string | null;
    },
  ) =>
    pedir<{ id: string; amountMinor: string }>(
      t,
      o,
      "comisiones/pagar",
      "No se pudo registrar el pago.",
      {
        method: "POST",
        body: datos,
      },
    ),
  resumen: (t: string, o: string, desde: string, hasta: string) =>
    pedir<ResumenPreventa>(
      t,
      o,
      `resumen${consulta({ desde, hasta })}`,
      "No se pudo armar el resumen.",
    ),
};
