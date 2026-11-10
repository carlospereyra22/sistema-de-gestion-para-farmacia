import {
  guardarVentaPendiente,
  ventasDeLaPc,
  type VentaPendiente,
} from "./bandeja-ventas";
import { leerSesion } from "./cache-local";
import { firmarVenta } from "./firma-ventas";
import { ahoraSegunServidor, idDeEstaPc } from "./venta-sin-conexion";

// Guarda en la bandeja de la PC una operación hecha sin conexión, firmada por
// quien la hace (SISTEMA-73: proveedores y cuentas por pagar). Se manda sola
// al volver internet, en orden con lo demás.

/**
 * Hora de la operación: la del servidor, pero siempre después de lo último
 * guardado en la PC. Así un pago nunca se manda antes que su deuda, ni una
 * deuda antes que el alta de su proveedor.
 */
export async function horaParaLaBandeja() {
  const ultima = Math.max(
    0,
    ...(await ventasDeLaPc().catch(() => [] as VentaPendiente[])).map((item) =>
      Date.parse(item.occurredAt),
    ),
  );
  return new Date(
    Math.max(ahoraSegunServidor().getTime(), ultima + 1),
  ).toISOString();
}

export async function guardarEnLaPc<
  T extends { clientOperationId: string; occurredAt: string },
>(
  organizationId: string,
  branchId: string,
  operacion: NonNullable<VentaPendiente["operacion"]>,
  datos: Omit<T, "occurredAt" | "deviceId">,
  totalMinor = "0",
): Promise<T & { deviceId: string }> {
  const sesion = await leerSesion();
  if (!sesion) throw new Error("No hay una sesión abierta en esta PC.");
  const op = {
    ...datos,
    occurredAt: await horaParaLaBandeja(),
    deviceId: idDeEstaPc(),
  } as T & { deviceId: string };
  const payload = JSON.stringify(op);
  const vendedorId = sesion.perfil.id;
  const firma = vendedorId
    ? await firmarVenta(sesion.alcance, payload).catch(() => undefined)
    : undefined;
  await guardarVentaPendiente({
    version: 1,
    id: op.clientOperationId,
    alcance: sesion.alcance,
    organizationId,
    branchId,
    occurredAt: op.occurredAt,
    totalMinor,
    documentType: "INTERNAL",
    cuerpo: op as unknown as Record<string, unknown>,
    unidades: [],
    estado: "PENDIENTE",
    intentos: 0,
    operacion,
    actorName:
      sesion.perfil.organizations.find(
        (membresia) => membresia.organizationId === organizationId,
      )?.displayName || sesion.perfil.email,
    ...(vendedorId && firma ? { vendedorId, payload, firma } : {}),
  });
  return op;
}
