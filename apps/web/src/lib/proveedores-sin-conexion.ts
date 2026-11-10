import type { Party, SupplierProfileInput } from "./api";
import type { VentaPendiente } from "./bandeja-ventas";
import { guardarEnLaPc } from "./guardar-en-la-pc";

// Proveedores sin conexión (SISTEMA-73). Sin internet se puede dar de alta,
// editar y dar de baja o restaurar un proveedor. Se guarda la operación en la
// PC, firmada por quien la hizo, y se manda sola al volver, en orden con lo
// demás. El proveedor nuevo se usa enseguida: su id es el de la PC.

type Base = { clientOperationId: string; occurredAt: string; deviceId: string };

export type OperacionProveedor = Base &
  (
    | {
        tipo: "ALTA";
        cuerpo: Partial<SupplierProfileInput> & {
          name: string;
          document?: string;
        };
      }
    | {
        tipo: "EDICION";
        supplierId: string;
        /** Sólo los campos que se cambiaron. */
        cuerpo: Partial<SupplierProfileInput>;
      }
    | { tipo: "ESTADO"; supplierId: string; cuerpo: { active: boolean } }
  );

const operacionDe = (item: VentaPendiente) =>
  item.operacion === "PROVEEDOR"
    ? (item.cuerpo as unknown as OperacionProveedor)
    : undefined;

/** Operaciones de proveedores de la farmacia que esperan llegar al servidor. */
function pendientesDe(bandeja: readonly VentaPendiente[], org: string) {
  return bandeja.flatMap((item) => {
    const op = operacionDe(item);
    return op && item.estado === "PENDIENTE" && item.organizationId === org
      ? [op]
      : [];
  });
}

const idDe = (op: OperacionProveedor) =>
  op.tipo === "ALTA" ? op.clientOperationId : op.supplierId;

/** ¿El proveedor tiene algo sin enviar? Lo nuevo va detrás, en la PC. */
export function proveedorConPendientes(
  bandeja: readonly VentaPendiente[],
  org: string,
  supplierId: string,
) {
  return pendientesDe(bandeja, org).some((op) => idDe(op) === supplierId);
}

/**
 * ¿El proveedor se dio de alta sin conexión y todavía no llegó? Todo lo que
 * lo use (compras, deudas) tiene que esperar en la PC para llegar después.
 */
export function proveedorSinEnviar(
  bandeja: readonly VentaPendiente[],
  org: string,
  supplierId: string,
) {
  return pendientesDe(bandeja, org).some(
    (op) => op.tipo === "ALTA" && op.clientOperationId === supplierId,
  );
}

/** Lista del servidor más lo hecho en la PC que todavía no llegó. */
export function proveedoresConPendientes(
  delServidor: readonly Party[],
  bandeja: readonly VentaPendiente[],
  org: string,
): Party[] {
  const lista = delServidor.map((p) => ({ ...p }));
  for (const op of pendientesDe(bandeja, org)) {
    if (op.tipo === "ALTA") {
      if (lista.some((p) => p.id === op.clientOperationId)) continue;
      const { name, document, accountEnabled, accountTermDays, ...perfil } =
        op.cuerpo;
      lista.push({
        ...perfil,
        id: op.clientOperationId,
        name: name.trim(),
        taxId: document?.trim() || null,
        accountEnabled: accountEnabled ?? false,
        accountTermDays: accountEnabled ? (accountTermDays ?? null) : null,
        active: true,
        porEnviar: true,
      });
      continue;
    }
    const proveedor = lista.find((p) => p.id === op.supplierId);
    if (!proveedor) continue;
    proveedor.porEnviar = true;
    if (op.tipo === "ESTADO") {
      proveedor.active = op.cuerpo.active;
      continue;
    }
    const { accountEnabled, accountTermDays, ...perfil } = op.cuerpo;
    for (const [campo, valor] of Object.entries(perfil))
      if (valor !== undefined)
        (proveedor as Record<string, unknown>)[campo] =
          typeof valor === "string" ? valor.trim() || null : valor;
    if (accountEnabled !== undefined) proveedor.accountEnabled = accountEnabled;
    if (accountTermDays !== undefined)
      proveedor.accountTermDays = accountTermDays;
    if (!proveedor.accountEnabled) proveedor.accountTermDays = null;
  }
  return lista.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Campos de la ficha que cambiaron respecto de lo que se ve. Sin conexión sólo
 * se mandan esos: si otra PC cambió otro campo, no se pisa.
 */
export function camposCambiados(
  antes: Party,
  despues: SupplierProfileInput,
): Partial<SupplierProfileInput> {
  const cambios: Partial<SupplierProfileInput> = {};
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  for (const campo of [
    "name",
    "phone",
    "email",
    "contactName",
    "address",
    "notes",
  ] as const)
    if (
      despues[campo] !== undefined &&
      texto(despues[campo]) !== texto(antes[campo])
    )
      cambios[campo] = despues[campo];
  if (despues.accountEnabled !== Boolean(antes.accountEnabled))
    cambios.accountEnabled = despues.accountEnabled;
  const plazo = despues.accountEnabled ? despues.accountTermDays : null;
  if (plazo !== (antes.accountEnabled ? (antes.accountTermDays ?? null) : null))
    cambios.accountTermDays = plazo;
  return cambios;
}

type DatosProveedor =
  | {
      tipo: "ALTA";
      cuerpo: Extract<OperacionProveedor, { tipo: "ALTA" }>["cuerpo"];
    }
  | {
      tipo: "EDICION";
      supplierId: string;
      cuerpo: Partial<SupplierProfileInput>;
    }
  | { tipo: "ESTADO"; supplierId: string; cuerpo: { active: boolean } };

/** Guarda la operación en la PC, firmada por quien la hace. */
export function guardarOperacionProveedor(
  organizationId: string,
  branchId: string,
  datos: DatosProveedor,
) {
  return guardarEnLaPc<OperacionProveedor>(
    organizationId,
    branchId,
    "PROVEEDOR",
    { ...datos, clientOperationId: crypto.randomUUID() } as Omit<
      OperacionProveedor,
      "occurredAt" | "deviceId"
    >,
  );
}

/** Nombre de la operación para el panel de sincronización. */
export function operacionProveedorTexto(item: VentaPendiente) {
  const op = operacionDe(item);
  if (!op) return "Proveedor";
  if (op.tipo === "ALTA") return `Alta de proveedor · ${op.cuerpo.name.trim()}`;
  if (op.tipo === "ESTADO")
    return op.cuerpo.active ? "Restauración de proveedor" : "Baja de proveedor";
  return "Edición de proveedor";
}
