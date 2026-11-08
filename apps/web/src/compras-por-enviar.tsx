import { useEffect, useState } from "react";
import {
  suscribirBandeja,
  ventasDeLaPc,
  type VentaPendiente,
} from "./lib/bandeja-ventas";
import {
  tipoDeCompraTexto,
  type OperacionCompra,
} from "./lib/compras-sin-conexion";

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

/**
 * Compras hechas sin conexión que el servidor rechazó (SISTEMA-69). Lo que
 * todavía está por enviar se ve en la tabla, con la etiqueta "Por enviar";
 * acá sólo queda lo que hay que revisar.
 */
export function ComprasPorEnviar({
  organizationId,
  branchId,
  proveedores,
}: {
  organizationId: string;
  branchId: string;
  proveedores: readonly { id: string; name: string }[];
}) {
  const [rechazadas, setRechazadas] = useState<VentaPendiente[]>([]);
  useEffect(() => {
    let activo = true;
    const cargar = () =>
      void ventasDeLaPc()
        .then((todas) => {
          if (activo)
            setRechazadas(
              todas.filter(
                (item) =>
                  item.operacion === "COMPRA" &&
                  item.estado === "RECHAZADA" &&
                  item.organizationId === organizationId &&
                  item.branchId === branchId,
              ),
            );
        })
        .catch(() => {});
    cargar();
    const dejar = suscribirBandeja(cargar);
    return () => {
      activo = false;
      dejar();
    };
  }, [organizationId, branchId]);
  if (!rechazadas.length) return null;
  return (
    <div
      role="alert"
      className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
    >
      <p className="font-medium">
        {rechazadas.length === 1
          ? "Una compra hecha sin conexión no se pudo registrar. Revisala y cargala de nuevo si corresponde:"
          : `${rechazadas.length} compras hechas sin conexión no se pudieron registrar. Revisalas y cargalas de nuevo si corresponde:`}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {rechazadas.map((item) => {
          const op = item.cuerpo as OperacionCompra;
          const proveedor = proveedores.find(
            (p) => p.id === op.cuerpo.supplierId,
          )?.name;
          return (
            <li key={item.id}>
              {tipoDeCompraTexto(op.tipo)}
              {proveedor ? ` · ${proveedor}` : ""} · {hora(item.occurredAt)}
              {item.ultimoError ? `: ${item.ultimoError}` : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
