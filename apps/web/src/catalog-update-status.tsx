import { useEffect, useId, useState } from "react";
import {
  getMedicineCatalogStatus,
  type MedicineCatalogStatus,
} from "./lib/api";

const timeZone = "America/Argentina/Buenos_Aires";

export function CatalogUpdateStatusView({
  status,
}: {
  status?: MedicineCatalogStatus;
}) {
  const tooltipId = useId();
  const checked = status?.lastCheckedAt;
  const valid = checked && Number.isFinite(Date.parse(checked));
  return (
    <div
      tabIndex={0}
      aria-describedby={tooltipId}
      className="group relative shrink-0 rounded-lg text-right leading-tight focus-visible:outline-2 focus-visible:outline-teal-600"
    >
      <p className="text-xs font-medium text-slate-700">Última actualización</p>
      <p className="mt-1 whitespace-nowrap text-[11px] tabular-nums text-slate-500">
        {valid
          ? new Date(checked).toLocaleDateString("es-AR", {
              timeZone,
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })
          : "Sin registro"}
      </p>
      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-600 shadow-lg group-hover:visible group-focus-within:visible"
      >
        <p className="font-semibold text-slate-800">Base de medicamentos</p>
        <p className="mt-1">
          {valid
            ? `Última revisión: ${new Date(checked).toLocaleString("es-AR", { timeZone })}`
            : "Sin revisión registrada"}
        </p>
        {status ? (
          <p className="mt-1">
            {status.items.toLocaleString("es-AR")} medicamentos en la base
          </p>
        ) : null}
        <p className="mt-1">
          Revisión automática: 09:00 y 17:00 (Argentina), con el servidor
          encendido.
        </p>
        <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
          Es la última vez que se leyó un precio de la base; no implica que
          todos se hayan revisado ni que sus precios hayan cambiado.
        </p>
      </div>
    </div>
  );
}

export function CatalogUpdateStatus({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [status, setStatus] = useState<MedicineCatalogStatus>();
  useEffect(() => {
    let current = true;
    void getMedicineCatalogStatus(token, organizationId)
      .then((next) => {
        if (current) setStatus(next);
      })
      // Es sólo informativo: si falla queda "Sin registro", sin frenar Productos.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [token, organizationId]);
  return <CatalogUpdateStatusView status={status} />;
}
