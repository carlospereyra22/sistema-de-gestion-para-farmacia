import type { SupplierProfile } from "./supplier-profile";

// Proveedores sin conexión (SISTEMA-73). Sin internet se puede dar de alta,
// editar la ficha y las condiciones, y dar de baja o restaurar un proveedor.
// Al volver se registra en orden, una sola vez y con su hora real. Si otra PC
// cambió lo mismo después, queda ese cambio (el más reciente) y un aviso.

export type CondicionesProveedor = {
  accountEnabled?: boolean;
  accountTermDays?: number | null;
};

export type OperacionProveedorSinConexion = {
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
} & (
  | {
      tipo: "ALTA";
      cuerpo: SupplierProfile &
        CondicionesProveedor & { name: string; document?: string };
    }
  | {
      tipo: "EDICION";
      supplierId: string;
      /** Sólo los campos que se cambiaron en la PC. */
      cuerpo: SupplierProfile & CondicionesProveedor;
    }
  | { tipo: "ESTADO"; supplierId: string; cuerpo: { active: boolean } }
);

export const KIND_PROVEEDOR = {
  ALTA: "SUPPLIER_CREATE",
  EDICION: "SUPPLIER_UPDATE",
  ESTADO: "SUPPLIER_STATE",
} as const;

type Registro = { createdAt: Date; before: unknown; after: unknown };

const objeto = (valor: unknown): Record<string, unknown> | undefined =>
  valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : undefined;

/**
 * Campos de la ficha que cambió un registro de auditoría. Sin conexión se
 * anotan (`fields`); con conexión se guarda la ficha entera, así que se
 * comparan el antes y el después.
 */
export function camposDelRegistro(registro: Registro): string[] {
  const after = objeto(registro.after);
  if (!after) return [];
  if (Array.isArray(after.fields))
    return after.fields.filter((c): c is string => typeof c === "string");
  const before = objeto(registro.before) ?? {};
  return Object.keys(after).filter(
    (campo) =>
      JSON.stringify(before[campo] ?? null) !==
      JSON.stringify(after[campo] ?? null),
  );
}

/** Cuándo pasó el cambio del registro: su hora real si se hizo sin conexión. */
export function horaDelRegistro(registro: Registro) {
  const cuando = objeto(registro.after)?.occurredAt;
  return typeof cuando === "string" ? new Date(cuando) : registro.createdAt;
}

/**
 * Campos pedidos que otra PC cambió después de la edición hecha sin
 * conexión: quedan como están, porque ese cambio es el más reciente.
 */
export function camposPisados(
  registros: readonly Registro[],
  cuando: Date,
  pedidos: readonly string[],
) {
  const pisados = new Set<string>();
  for (const registro of registros) {
    if (horaDelRegistro(registro) <= cuando) continue;
    for (const campo of camposDelRegistro(registro))
      if (pedidos.includes(campo)) pisados.add(campo);
  }
  return [...pisados];
}
