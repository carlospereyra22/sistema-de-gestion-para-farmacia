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
      aria-label={`Volver al panel (estás como ${etiqueta})`}
      title={`Soporte: estás como ${etiqueta}`}
      className="group fixed bottom-3 left-3 z-[100] inline-flex h-8 items-center gap-0 rounded-full border border-white/10 bg-[#1b2735]/90 px-2 text-slate-200 shadow-[0_4px_14px_rgb(15_23_42_/_28%)] backdrop-blur transition-all duration-200 hover:gap-1.5 hover:bg-[#1b2735] hover:pr-3 hover:text-white focus-visible:gap-1.5 focus-visible:pr-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 motion-reduce:transition-none"
    >
      <ArrowLeft size={15} aria-hidden="true" className="shrink-0" />
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold transition-[max-width] duration-200 group-hover:max-w-40 group-focus-visible:max-w-40 motion-reduce:transition-none">
        Volver al panel
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
