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
    default:
      return {
        titulo: "Venta sin conexión para revisar",
        detalle: "Algo cambió mientras no había conexión.",
      };
  }
}
