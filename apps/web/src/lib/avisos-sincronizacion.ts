import type { OfflineIssue } from "./api";

// Texto de los avisos "a revisar" de ventas sincronizadas sin conexión
// (SISTEMA-63/64): qué pasó y qué conviene revisar.

const pesos = (minor: string | number | null | undefined) =>
  minor === null || minor === undefined || minor === ""
    ? "—"
    : (Number(minor) / 100).toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
      });

const texto = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

export function textoAviso(issue: Pick<OfflineIssue, "kind" | "detail">): {
  titulo: string;
  detalle: string;
} {
  const d = issue.detail;
  const nombre = texto(d.nombre) || "Un producto";
  switch (issue.kind) {
    case "PRECIO_DISTINTO":
      return {
        titulo: `Precio distinto: ${nombre}`,
        detalle: `Se cobró ${pesos(d.cobradoMinor)} y en el sistema estaba ${pesos(d.actualMinor)}. Se respetó lo cobrado.`,
      };
    case "STOCK_FALTANTE":
      // Transferencia despachada o preparada sin conexión (SISTEMA-71).
      if (d.enviado !== undefined || d.pedido !== undefined)
        return {
          titulo: `Stock que no alcanzó en una transferencia: ${nombre}`,
          detalle:
            d.enviado !== undefined
              ? `Se despacharon ${texto(d.enviado)} y ${texto(d.faltan)} no estaban en el sistema: el lote quedó en cero. Revisá el stock de origen.`
              : `Se prepararon ${texto(d.pedido)} y el lote tenía ${texto(d.disponible)}. Revisalo antes de despachar.`,
        };
      return {
        titulo: `Stock que no alcanzó: ${nombre}`,
        detalle: `Se vendieron ${texto(d.vendidas)} y ${texto(d.faltantes)} no estaban en el sistema. Revisá el stock: puede faltar cargar una compra o un ajuste.`,
      };
    case "PRODUCTO_NO_DISPONIBLE":
      return {
        titulo: `Producto que ya no se vende: ${nombre}`,
        detalle:
          "Se archivó mientras no había conexión. Quedó registrado como concepto, sin descontar stock.",
      };
    case "CLIENTE_INACTIVO":
      return {
        titulo: "Cliente dado de baja",
        detalle:
          "La venta se hizo a un cliente que se desactivó mientras no había conexión.",
      };
    case "LISTA_INACTIVA":
      return {
        titulo: "Lista de precios inactiva",
        detalle:
          "Se usó una lista que se desactivó mientras no había conexión. Se respetaron los precios cobrados.",
      };
    case "LIMITE_CREDITO":
      return {
        titulo: "Cuenta corriente por encima del límite",
        detalle: texto(d.motivo)
          ? `${texto(d.motivo)} Se registró igual una deuda de ${pesos(d.importeMinor)}.`
          : `El saldo superó el límite del cliente (${pesos(d.limiteMinor)}). Se registró igual una deuda de ${pesos(d.importeMinor)}.`,
      };
    case "CAJA_CERRADA":
      return {
        titulo: "Caja cerrada al sincronizar",
        detalle:
          "El cobro quedó pendiente de asignar a una caja. Asignalo desde Caja.",
      };
    case "FACTURA_NO_PREPARADA":
      return {
        titulo: "Factura no emitida",
        detalle: `La venta quedó como ticket. ${texto(d.motivo)}`.trim(),
      };
    // Caja sin conexión (SISTEMA-67).
    case "CAJA_YA_ABIERTA":
      return {
        titulo: `Caja ya abierta: ${texto(d.caja) || "caja"}`,
        detalle:
          "Otra PC la abrió mientras no había conexión. Las ventas y movimientos de esta PC se sumaron a esa sesión.",
      };
    case "OTRA_CAJA_ABIERTA":
      return {
        titulo: "Dos cajas abiertas por la misma persona",
        detalle: `Al abrir sin conexión ya tenía abierta ${texto(d.caja)} en ${texto(d.sucursal)}. Revisá cuál corresponde cerrar.`,
      };
    case "EGRESO_SUPERA_EFECTIVO":
      return {
        titulo: "Egreso mayor al efectivo",
        detalle: `Se registró un egreso de ${pesos(d.amountMinor)} (${texto(d.motivo)}) y en la caja había ${pesos(d.disponibleMinor)}.`,
      };
    case "MOVIMIENTO_RETENIDO":
      return {
        titulo: `Movimiento fuera de caja: ${texto(d.caja) || "caja"}`,
        detalle: `El ${d.tipo === "OUT" ? "egreso" : "ingreso"} de ${pesos(d.amountMinor)} (${texto(d.motivo)}) llegó con la caja ya cerrada y no entró en ese cierre. Registralo a mano si corresponde.`,
      };
    case "CIERRE_DISTINTO":
      return {
        titulo: `Cierre para revisar: ${texto(d.caja) || "caja"}`,
        detalle: d.esperadoMinor
          ? `La PC mostraba ${pesos(d.vioMinor)} esperados y el servidor calculó ${pesos(d.esperadoMinor)}. Se contaron ${pesos(d.contadoMinor)}.`
          : `${texto(d.motivo)} Se contaron ${pesos(d.contadoMinor)}.`.trim(),
      };
    // Cuenta corriente sin conexión (SISTEMA-70).
    case "SALDO_A_FAVOR":
      return {
        titulo: `Saldo a favor: ${texto(d.cliente) || "cliente"}`,
        detalle: `${texto(d.motivo) || "El cobro superó la deuda."} Quedaron ${pesos(d.aFavorMinor)} a favor del cliente.`,
      };
    case "SALDO_DISTINTO":
      return {
        titulo: `Saldo distinto: ${texto(d.articulo) || texto(d.cliente) || "cuenta corriente"}`,
        detalle: [
          texto(d.motivo),
          d.esperadoMinor
            ? `La PC veía ${pesos(d.esperadoMinor)} y el servidor tenía ${pesos(d.encontradoMinor)}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    case "CONFIGURACION_PISADA":
      return {
        titulo: `Cuenta configurada en otra PC: ${texto(d.cliente) || "cliente"}`,
        detalle:
          texto(d.motivo) ||
          "Otra PC cambió el límite o el plazo después: quedó ese cambio.",
      };
    case "CLIENTE_DUPLICADO":
      return {
        titulo: `Cliente repetido: ${texto(d.cliente) || "cliente"}`,
        detalle: texto(d.motivo) || "Ya había un cliente con ese DNI/CUIT.",
      };
    // Transferencias sin conexión (SISTEMA-71).
    case "TRANSFERENCIA_YA_DESPACHADA":
      return {
        titulo: "Transferencia ya despachada en otra PC",
        detalle:
          texto(d.motivo) ||
          "Otra PC ya la había despachado: no se descontó stock otra vez.",
      };
    case "TRANSFERENCIA_YA_RECIBIDA":
      return {
        titulo: "Transferencia ya recibida en otra PC",
        detalle:
          texto(d.motivo) ||
          "Otra PC ya la había recibido: no se sumó stock otra vez.",
      };
    default:
      return {
        titulo: "Venta sin conexión para revisar",
        detalle: "Algo cambió mientras no había conexión.",
      };
  }
}
