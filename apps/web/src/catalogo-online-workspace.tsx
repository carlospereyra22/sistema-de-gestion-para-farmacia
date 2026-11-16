import { useState } from "react";

import { CatalogoConfiguracion } from "./catalogo-configuracion";
import { CatalogoPedidos } from "./catalogo-pedidos";
import { CatalogoUsuarios } from "./catalogo-usuarios";
import { pestanasVisibles, type PestanaCatalogo } from "./lib/catalogo-online";

/**
 * Catálogo online desde la gestión (SISTEMA-107): pedidos que llegan, usuarios
 * del portal y configuración de la página pública.
 */
export function CatalogoOnlineWorkspace({
  token,
  organizationId,
  branches,
  canSeeOrders,
  canManageOrders,
  canConfigure,
  onError,
}: {
  token: string;
  organizationId: string;
  branches: { id: string; name: string }[];
  canSeeOrders: boolean;
  canManageOrders: boolean;
  canConfigure: boolean;
  onError: (message: string) => void;
}) {
  const pestanas = pestanasVisibles(canSeeOrders, canConfigure);
  const [pestana, setPestana] = useState<PestanaCatalogo>(
    pestanas[0]?.id ?? "pedidos",
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div
        role="tablist"
        aria-label="Secciones del catálogo online"
        className="flex flex-wrap gap-6 border-b border-slate-200"
      >
        {pestanas.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={`-mb-px border-b-2 px-1 pb-3 text-sm transition-colors ${
              pestana === id
                ? "border-teal-600 font-semibold text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {pestana === "pedidos" && canSeeOrders ? (
        <CatalogoPedidos
          token={token}
          organizationId={organizationId}
          canManage={canManageOrders}
          onError={onError}
        />
      ) : null}
      {pestana === "usuarios" && canConfigure ? (
        <CatalogoUsuarios
          token={token}
          organizationId={organizationId}
          onError={onError}
        />
      ) : null}
      {pestana === "configuracion" && canConfigure ? (
        <CatalogoConfiguracion
          token={token}
          organizationId={organizationId}
          branches={branches}
          onError={onError}
        />
      ) : null}
    </div>
  );
}
