import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "./lib/api";
import type { SesionSoporte } from "./lib/platform-api";
import { datosDelPerfil, msHastaVencer } from "./lib/soporte";
import { ProductImageSession } from "./product-image-session";
import { SessionStartup } from "./session-startup";
import { SubscriptionGate } from "./subscription-gate";
import { WorkspaceShell } from "./workspace-shell";

/**
 * El superadmin dentro de una farmacia como uno de sus usuarios (SISTEMA-89):
 * la app es la misma que ve ese usuario. Sólo se agrega el botón para volver
 * al panel, que ve únicamente quien está en esta pantalla. La sesión vence sola.
 */
export function SoporteSesion({
  sesion,
  etiqueta,
  onVolver,
}: {
  sesion: SesionSoporte;
  /** "Ana · Farmacia Centro", para el botón de volver. */
  etiqueta: string;
  onVolver: () => void;
}) {
  const [datos, setDatos] = useState<ReturnType<typeof datosDelPerfil>>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let activo = true;
    getCurrentUser(sesion.accessToken)
      .then((perfil) => activo && setDatos(datosDelPerfil(perfil)))
      .catch(() => activo && setError(true));
    return () => {
      activo = false;
    };
  }, [sesion.accessToken]);

  // Al vencer, de vuelta al panel.
  useEffect(() => {
    const timer = window.setTimeout(onVolver, msHastaVencer(sesion.expiresAt));
    return () => window.clearTimeout(timer);
  }, [sesion.expiresAt, onVolver]);

  const volver = (
    <button
      type="button"
      onClick={onVolver}
      title={`Soporte: estás como ${etiqueta}`}
      className="fixed bottom-4 left-4 z-[100] inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-slate-900"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Volver al panel
      <span className="hidden max-w-[220px] truncate text-xs font-normal text-slate-300 sm:inline">
        {etiqueta}
      </span>
    </button>
  );

  if (error)
    return (
      <>
        <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
          <p
            role="alert"
            className="rounded-xl border bg-white p-6 text-sm text-slate-700 shadow-sm"
          >
            No se pudo entrar como este usuario. Volvé al panel y probá de
            nuevo.
          </p>
        </main>
        {volver}
      </>
    );
  if (!datos || !datos.organizationId)
    return (
      <>
        <SessionStartup failed={false} />
        {volver}
      </>
    );
  return (
    <>
      <ProductImageSession key={`soporte|${datos.email}`}>
        <SubscriptionGate
          token={sesion.accessToken}
          organizationId={datos.organizationId}
          email={datos.email}
          onLogout={onVolver}
        >
          <WorkspaceShell
            email={datos.email}
            displayName={datos.displayName}
            organizationName={datos.organizationName}
            accessToken={sesion.accessToken}
            organizationId={datos.organizationId}
            permissionCodes={datos.permissionCodes}
            onLogout={onVolver}
          />
        </SubscriptionGate>
      </ProductImageSession>
      {volver}
    </>
  );
}
