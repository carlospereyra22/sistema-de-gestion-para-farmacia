import { CatalogoOnlineWorkspace } from "./catalogo-online-workspace";
import { IconoImagen } from "./icono-imagen";
import { ICONOS_MENU_LATERAL } from "./lib/iconos-menu-lateral";
import { pestanasDePedidos, type PestanaPedidos } from "./lib/pedidos";
import type { PedidoPreventa } from "./lib/preventa-api";
import { PedidosWorkspace } from "./pedidos-workspace";
import { PreventaWorkspace } from "./preventa-workspace";

const PESTANAS: { id: PestanaPedidos; label: string; icono: string }[] = [
  { id: "pedidos", label: "Pedidos", icono: ICONOS_MENU_LATERAL.Pedidos },
  { id: "preventa", label: "Preventa", icono: ICONOS_MENU_LATERAL.Preventa },
  {
    id: "catalogo",
    label: "Catálogo online",
    icono: ICONOS_MENU_LATERAL["Catálogo online"],
  },
];

/**
 * Pedidos con el catálogo online y la preventa adentro (SISTEMA-119). Con la
 * vista unida, esos dos módulos salen del menú: sus pedidos están juntos en la
 * primera pestaña y el resto de cada módulo (reparto, clientes, comisiones,
 * usuarios del portal, configuración) en la suya.
 */
export function PedidosModulo({
  token,
  organizationId,
  branches,
  pestana,
  onPestana,
  acceso,
  canManageCatalog,
  preventaParaEditar,
  onEditarPreventa,
  onAbrirPreventaMovil,
  onError,
}: {
  token: string;
  organizationId: string;
  branches: { id: string; name: string }[];
  pestana: PestanaPedidos;
  onPestana: (pestana: PestanaPedidos) => void;
  acceso: {
    verPedidos: boolean;
    verPreventa: boolean;
    configurarCatalogo: boolean;
  };
  canManageCatalog: boolean;
  preventaParaEditar: PedidoPreventa | null;
  onEditarPreventa: (pedido: PedidoPreventa | null) => void;
  onAbrirPreventaMovil?: () => void;
  onError: (message: string) => void;
}) {
  const visibles = pestanasDePedidos(acceso);
  const actual = visibles.includes(pestana) ? pestana : visibles[0];
  if (!actual) return null;
  return (
    <div className="min-w-0">
      {visibles.length > 1 ? (
        <nav
          aria-label="Secciones de pedidos"
          className="mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-200/50 p-1.5"
        >
          {PESTANAS.filter(({ id }) => visibles.includes(id)).map(
            ({ id, label, icono }) => (
              <button
                key={id}
                type="button"
                aria-current={actual === id ? "page" : undefined}
                onClick={() => onPestana(id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
                  actual === id
                    ? "bg-white text-teal-700 shadow-sm"
                    : "text-slate-500 hover:bg-white/60 hover:text-teal-700"
                }`}
              >
                <IconoImagen url={icono} className="-my-0.5 size-6" />
                {/* En un span: "font: inherit" de los botones pisaría la letra. */}
                <span
                  className={`text-sm ${actual === id ? "font-semibold" : ""}`}
                >
                  {label}
                </span>
              </button>
            ),
          )}
        </nav>
      ) : null}
      {actual === "pedidos" ? (
        <PedidosWorkspace
          token={token}
          organizationId={organizationId}
          canManageCatalog={canManageCatalog}
          onEditarPreventa={(pedido) => {
            onEditarPreventa(pedido);
            onPestana("preventa");
          }}
        />
      ) : null}
      {actual === "preventa" ? (
        <PreventaWorkspace
          key={`preventa:${organizationId}:${preventaParaEditar?.id ?? ""}`}
          token={token}
          organizationId={organizationId}
          branches={branches}
          movil={false}
          incrustado
          onAbrirMovil={onAbrirPreventaMovil}
          sinPedidos
          editarAlAbrir={preventaParaEditar}
          onVolverAPedidos={() => {
            onEditarPreventa(null);
            onPestana("pedidos");
          }}
        />
      ) : null}
      {actual === "catalogo" ? (
        <CatalogoOnlineWorkspace
          key={`catalogo:${organizationId}`}
          token={token}
          organizationId={organizationId}
          branches={branches}
          // Sus pedidos están en la primera pestaña.
          canSeeOrders={false}
          canManageOrders={canManageCatalog}
          canConfigure={acceso.configurarCatalogo}
          incrustado
          onError={onError}
        />
      ) : null}
    </div>
  );
}
