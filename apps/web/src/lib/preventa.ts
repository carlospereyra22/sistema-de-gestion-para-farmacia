import type {
  EfectoEntrega,
  EstadoCobro,
  EstadoPreventa,
  MedioCobro,
  PedidoPreventa,
} from "./preventa-api";

/**
 * Lógica de vista de la preventa (SISTEMA-108). Nada de esto es autoridad:
 * precios, totales, permisos y estados los decide la API.
 */

export type Tono = "aviso" | "info" | "bien" | "mal" | "neutro" | "marca";

/** Clases de la pastilla de estado (tokens de Tailwind, sirven en modo oscuro). */
export const CLASES_TONO: Record<Tono, string> = {
  aviso: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-800",
  bien: "bg-emerald-100 text-emerald-800",
  mal: "bg-rose-100 text-rose-800",
  neutro: "bg-slate-100 text-slate-700",
  marca: "bg-teal-100 text-teal-800",
};

export const PUNTO_TONO: Record<Tono, string> = {
  aviso: "bg-amber-500",
  info: "bg-sky-500",
  bien: "bg-emerald-500",
  mal: "bg-rose-500",
  neutro: "bg-slate-400",
  marca: "bg-teal-500",
};

export const ESTADOS: Record<
  EstadoPreventa,
  { label: string; detalle: string; tono: Tono }
> = {
  PENDING: {
    label: "Pendiente",
    detalle: "Tomado, falta salir a reparto.",
    tono: "aviso",
  },
  IN_DELIVERY: {
    label: "En reparto",
    detalle: "Lo lleva un repartidor.",
    tono: "info",
  },
  DELIVERED: {
    label: "Entregado",
    detalle: "El cliente lo recibió.",
    tono: "bien",
  },
  CANCELLED: {
    label: "Cancelado",
    detalle: "No se entrega.",
    tono: "neutro",
  },
};

export const COBROS: Record<EstadoCobro, { label: string; tono: Tono }> = {
  PAGADO: { label: "Pagado", tono: "bien" },
  PARCIAL: { label: "Pago parcial", tono: "marca" },
  SIN_PAGO: { label: "Sin pagar", tono: "mal" },
};

export const MEDIOS: Record<MedioCobro, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
};

export const EFECTOS: Record<
  EfectoEntrega,
  { label: string; detalle: string }
> = {
  NONE: {
    label: "Sólo registrar la entrega",
    detalle:
      "El pedido queda entregado y con lo que pagó el cliente. No toca stock, ventas, caja ni cuentas corrientes.",
  },
  STOCK: {
    label: "Descontar stock",
    detalle:
      "Al entregarlo se descuenta el stock de la sucursal (primero lo que vence antes). No pasa por Ventas ni Caja.",
  },
  SALE: {
    label: "Registrar la venta",
    detalle:
      "Al entregarlo se registra la venta: descuenta stock, lo cobrado queda en Cobros pendientes de Caja para que el repartidor lo rinda y lo que falta va a la cuenta corriente del cliente.",
  },
};

export const pesos = (minor: string | number | bigint) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(minor) / 100,
  );

/** Importe sin el signo de pesos, para tablas angostas. */
export const importe = (minor: string | number | bigint) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(minor) / 100);

export const numeroDePedido = (numero: number) =>
  `P-${String(numero).padStart(5, "0")}`;

export const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

export const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

/** Hoy (o `dias` atrás) como AAAA-MM-DD en la hora de la PC. */
export function diaLocal(dias = 0, ahora = new Date()): string {
  const d = new Date(ahora);
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2,5" → 250 centésimos de punto; null si no es un porcentaje válido. */
export function porcentajeABps(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(limpio)) return null;
  const bps = Math.round(Number(limpio) * 100);
  return bps >= 0 && bps <= 10_000 ? bps : null;
}

export const bpsATexto = (bps: number) =>
  `${(bps / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;

/** "1.500,50" o "1500.5" → centavos; null si no es un importe. */
export function pesosACentavos(texto: string): number | null {
  const limpio = texto.trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!limpio) return 0;
  const normal = limpio.includes(",")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio.replace(/\.(?=\d{3}(\D|$))/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Math.round(Number(normal) * 100);
}

export const DIAS = [
  { bit: 1, corto: "Lu", largo: "Lunes", dia: 1 },
  { bit: 2, corto: "Ma", largo: "Martes", dia: 2 },
  { bit: 3, corto: "Mi", largo: "Miércoles", dia: 3 },
  { bit: 4, corto: "Ju", largo: "Jueves", dia: 4 },
  { bit: 5, corto: "Vi", largo: "Viernes", dia: 5 },
  { bit: 6, corto: "Sá", largo: "Sábado", dia: 6 },
  { bit: 0, corto: "Do", largo: "Domingo", dia: 0 },
] as const;

export const cambiarDia = (mascara: number, bit: number) =>
  mascara ^ (1 << bit);
export const tieneDia = (mascara: number, bit: number) =>
  (mascara & (1 << bit)) !== 0;

export function diasDeVisita(mascara: number): string {
  if (!mascara) return "Sin días fijos";
  if (mascara === 127) return "Todos los días";
  return DIAS.filter((d) => tieneDia(mascara, d.bit))
    .map((d) => d.corto)
    .join(" · ");
}

export type Punto = { latitude: number; longitude: number };

/** Distancia en km entre dos puntos (haversine). */
export function distanciaKm(a: Punto, b: Punto): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const conUbicacion = <
  T extends { latitude: number | null; longitude: number | null },
>(
  item: T,
): item is T & Punto => item.latitude !== null && item.longitude !== null;

/**
 * Recorrido sugerido: desde donde estoy, siempre al más cercano que falta
 * (vecino más cercano). Los que no tienen ubicación van al final, en el orden
 * en que estaban. Es una ayuda: el repartidor puede seguir otro orden.
 */
export function recorrido<
  T extends { latitude: number | null; longitude: number | null },
>(paradas: readonly T[], desde: Punto | null): { orden: T[]; km: number } {
  const ubicadas = paradas.filter(conUbicacion);
  const sinUbicar = paradas.filter((p) => !conUbicacion(p));
  const orden: T[] = [];
  let km = 0;
  let actual: Punto | null = desde;
  const quedan = [...ubicadas];
  while (quedan.length) {
    let mejor = 0;
    if (actual) {
      let menor = Number.POSITIVE_INFINITY;
      quedan.forEach((p, i) => {
        const d = distanciaKm(actual!, p);
        if (d < menor) {
          menor = d;
          mejor = i;
        }
      });
      km += menor;
    }
    const siguiente = quedan.splice(mejor, 1)[0]!;
    orden.push(siguiente);
    actual = siguiente;
  }
  return { orden: [...orden, ...sinUbicar], km };
}

/** Link para abrir un punto (o una dirección) en Google Maps. */
export function linkMapa(p: {
  latitude: number | null;
  longitude: number | null;
  address?: string | null;
}): string | null {
  if (p.latitude !== null && p.longitude !== null)
    return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
  if (p.address?.trim())
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address.trim())}`;
  return null;
}

/** Ruta con varias paradas en Google Maps (hasta 9 intermedias). */
export function linkRecorrido(paradas: readonly Punto[], desde: Punto | null) {
  if (!paradas.length) return null;
  const punto = (p: Punto) => `${p.latitude},${p.longitude}`;
  const lista = paradas.slice(0, 10);
  const destino = lista[lista.length - 1]!;
  const intermedias = lista.slice(0, -1);
  const params = new URLSearchParams({
    api: "1",
    destination: punto(destino),
    travelmode: "driving",
  });
  if (desde) params.set("origin", punto(desde));
  if (intermedias.length)
    params.set("waypoints", intermedias.map(punto).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Teléfono para WhatsApp: sólo dígitos, con 54 adelante si no lo tiene. */
export function telefonoWhatsapp(telefono: string | null): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  return digitos.startsWith("54") ? digitos : `54${digitos.replace(/^0/, "")}`;
}

export type DatosComprobante = {
  farmacia: string;
  sucursal: string;
  direccion: string;
  telefono: string;
  nota: string | null;
};

/** Texto del pedido para mandar por WhatsApp. */
export function textoDelPedido(
  pedido: PedidoPreventa,
  comprobante: DatosComprobante,
): string {
  const lineas = [
    `*${comprobante.farmacia}*`,
    `Pedido ${numeroDePedido(pedido.number)} · ${fecha(pedido.createdAt)}`,
    `Cliente: ${pedido.customerName}`,
    "",
    ...pedido.items.map(
      (item) =>
        `${item.quantity} x ${item.productName} — ${pesos(BigInt(item.unitPriceMinor) * BigInt(item.quantity))}`,
    ),
    "",
    ...(pedido.offers.length
      ? pedido.offers.map(
          (o) => `Oferta ${o.label}: -${pesos(o.discountMinor)}`,
        )
      : []),
    `*Total: ${pesos(pedido.totalMinor)}*`,
    ...(BigInt(pedido.paidMinor) > 0n
      ? [
          `Pagado: ${pesos(pedido.paidMinor)}`,
          `Saldo: ${pesos(BigInt(pedido.totalMinor) - BigInt(pedido.paidMinor))}`,
        ]
      : []),
    ...(comprobante.nota ? ["", comprobante.nota] : []),
  ];
  return lineas.join("\n");
}

/** Saldo que le falta pagar al pedido. */
export const saldoDelPedido = (
  p: Pick<PedidoPreventa, "totalMinor" | "paidMinor">,
) => BigInt(p.totalMinor) - BigInt(p.paidMinor);

export const mensajeDe = (causa: unknown) =>
  causa instanceof Error ? causa.message : String(causa);

export type SeccionPreventa =
  | "nuevo"
  | "pedidos"
  | "reparto"
  | "clientes"
  | "ofertas"
  | "comisiones"
  | "resumen"
  | "configuracion";

export const SECCIONES: Record<
  SeccionPreventa,
  { label: string; corto: string }
> = {
  nuevo: { label: "Nuevo pedido", corto: "Pedido" },
  pedidos: { label: "Pedidos", corto: "Pedidos" },
  reparto: { label: "Reparto", corto: "Reparto" },
  clientes: { label: "Clientes", corto: "Clientes" },
  ofertas: { label: "Ofertas", corto: "Ofertas" },
  comisiones: { label: "Comisiones", corto: "Comisiones" },
  resumen: { label: "Resumen", corto: "Resumen" },
  configuracion: { label: "Configuración", corto: "Ajustes" },
};

/** Qué secciones ve cada uno según sus permisos de preventa. */
export function seccionesVisibles(permisos: {
  vender: boolean;
  repartir: boolean;
  administrar: boolean;
}): SeccionPreventa[] {
  const { vender, repartir, administrar } = permisos;
  const lista: SeccionPreventa[] = [];
  if (vender) lista.push("nuevo");
  lista.push("pedidos");
  if (repartir || administrar) lista.push("reparto");
  lista.push("clientes");
  if (vender) lista.push("ofertas");
  if (vender || administrar) lista.push("comisiones", "resumen");
  if (administrar) lista.push("configuracion");
  return lista;
}

/** La primera pantalla: el preventista arma pedidos; el repartidor reparte. */
export function seccionInicial(permisos: {
  vender: boolean;
  repartir: boolean;
  administrar: boolean;
}): SeccionPreventa {
  if (permisos.administrar) return "pedidos";
  if (permisos.vender) return "nuevo";
  return "reparto";
}
