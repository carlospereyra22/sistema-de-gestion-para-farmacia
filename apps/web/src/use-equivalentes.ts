import { useEffect, useState } from "react";
import {
  getEquivalentes,
  type ConsultaEquivalentes,
  type Equivalentes,
} from "./lib/equivalentes";

export type EstadoEquivalentes =
  | { tipo: "cargando" }
  | { tipo: "listo"; datos: Equivalentes }
  | { tipo: "error"; mensaje: string };

// Consulta los equivalentes cuando cambia el producto. `activo` permite
// esperar a que el usuario lo pida (Inicio).
export function useEquivalentes(
  token: string,
  organizationId: string,
  branchId: string | undefined,
  consulta: ConsultaEquivalentes | undefined,
  activo = true,
): EstadoEquivalentes | undefined {
  const [estado, setEstado] = useState<EstadoEquivalentes>();
  const clave = consulta ? JSON.stringify(consulta) : "";
  useEffect(() => {
    if (!activo || !branchId || !consulta) {
      setEstado(undefined);
      return;
    }
    let vigente = true;
    setEstado({ tipo: "cargando" });
    getEquivalentes(token, organizationId, branchId, consulta).then(
      (datos) => vigente && setEstado({ tipo: "listo", datos }),
      (error: unknown) =>
        vigente &&
        setEstado({
          tipo: "error",
          mensaje:
            error instanceof Error
              ? error.message
              : "No se pudieron consultar los equivalentes.",
        }),
    );
    return () => {
      vigente = false;
    };
    // `clave` resume la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, organizationId, branchId, clave, activo]);
  return estado;
}
