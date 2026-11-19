import { useEffect, useState } from "react";

import { getBranches } from "./lib/api";
import { PreventaWorkspace } from "./preventa-workspace";

/**
 * Preventa a pantalla completa para el celular (SISTEMA-108): la abre quien
 * sólo toma pedidos o reparte, o cualquiera desde "Preventa (versión
 * celular)". Misma sesión y datos que la gestión.
 */
export function PreventaApp({
  token,
  organizationId,
  organizationName,
  onIrAGestion,
  onLogout,
}: {
  token: string;
  organizationId: string;
  organizationName?: string;
  onIrAGestion?: () => void;
  onLogout: () => void;
}) {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    getBranches(token, organizationId)
      .then((lista) =>
        setBranches(
          lista
            .filter((b) => b.active)
            .map((b) => ({ id: b.id, name: b.name })),
        ),
      )
      .catch(() => setBranches([]));
  }, [token, organizationId]);

  return (
    <PreventaWorkspace
      token={token}
      organizationId={organizationId}
      branches={branches}
      movil
      movilChrome={{ organizationName, onIrAGestion, onLogout }}
    />
  );
}
