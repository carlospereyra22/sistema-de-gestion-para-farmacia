import { useCallback, useContext, useMemo, useState } from "react";
import {
  Clock3,
  EyeOff,
  Landmark,
  LifeBuoy,
  LogIn,
  MonitorSmartphone,
  MapPin,
  Search,
  Store,
  Users,
} from "lucide-react";
import {
  getPlatformOrganization,
  getPlatformOrganizations,
} from "./lib/platform-api";
import {
  eleccionDeSoporteGuardada,
  guardarEleccionDeSoporte,
} from "./lib/platform-navegacion";
import { usePlatformData } from "./lib/use-platform-data";
import {
  SoporteContext,
  eleccionDeSoporte,
  iniciales,
  opcionesDeFarmacias,
  opcionesDeSucursales,
  valorDeSoporte,
  type UsuarioDeFarmacia,
} from "./lib/soporte-panel";
import {
  PlatformEmpty,
  PlatformError,
  PlatformPageHeader,
  PlatformPanel,
} from "./platform-ui";
import { ProductFilterSelect } from "./product-filter-select";
import { SearchableSaleSelect } from "./searchable-sale-select";

/** Botón "Entrar como" de un usuario; no se muestra si el panel no lo ofrece. */
export function BotonEntrarComo({
  organizationId,
  organizationName,
  usuario,
  destacado = false,
}: {
  organizationId: string;
  organizationName: string;
  usuario: UsuarioDeFarmacia;
  /** Botón lleno (tarjetas de Soporte) en vez de enlace (tablas). */
  destacado?: boolean;
}) {
  const entrarComo = useContext(SoporteContext);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState("");
  if (!entrarComo || !usuario.active) return null;
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={entrando}
        aria-label={`Entrar como ${usuario.email}`}
        title="Entrar como este usuario"
        className={
          destacado
            ? "inline-flex h-9 items-center gap-1.5 rounded-lg border border-marca-908 bg-teal-50 px-3 text-sm font-semibold text-marca-535 transition-colors hover:border-marca-535 hover:bg-marca-535 hover:text-white disabled:opacity-50"
            : "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50"
        }
        onClick={() => {
          setEntrando(true);
          setError("");
          void entrarComo(organizationId, organizationName, usuario)
            .catch((cause: unknown) =>
              setError(
                cause instanceof Error ? cause.message : "No se pudo entrar.",
              ),
            )
            .finally(() => setEntrando(false));
        }}
      >
        <LogIn size={16} aria-hidden="true" />
        {entrando ? "Entrando…" : "Entrar como"}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}

const reglas = [
  {
    icono: MonitorSmartphone,
    titulo: "Ves lo mismo que el usuario",
    texto: "Sus permisos, su sucursal y sus pantallas.",
  },
  {
    icono: EyeOff,
    titulo: "La farmacia no lo ve",
    texto: "Queda solo en la auditoría de la plataforma.",
  },
  {
    icono: Landmark,
    titulo: "Sin ARCA producción",
    texto: "Homologación sí; facturas reales, no.",
  },
  {
    icono: Clock3,
    titulo: "Hasta que vuelvas",
    texto:
      "Dura lo que haga falta. Volvés con el botón de abajo a la izquierda.",
  },
];

/** Sección "Soporte": elegís la farmacia y entrás como uno de sus usuarios. */
export function PlatformSoporte({
  token,
  onVerificationExpired,
}: {
  token: string;
  onVerificationExpired: () => void;
}) {
  const cargar = useCallback(() => getPlatformOrganizations(token), [token]);
  const { data, error } = usePlatformData(cargar, onVerificationExpired);
  const [elegida, setElegida] = useState(eleccionDeSoporteGuardada);
  const farmacias = useMemo(() => opcionesDeFarmacias(data ?? []), [data]);
  const elegidaAntes = eleccionDeSoporte(elegida);
  const farmacia = data?.find(({ id }) => id === elegidaAntes.organizationId);
  // Una elección guardada de una farmacia o sucursal que ya no está no se usa.
  const organizationId = !data || farmacia ? elegidaAntes.organizationId : "";
  const branchId =
    elegidaAntes.branchId &&
    (!farmacia ||
      farmacia.branches?.some(({ id }) => id === elegidaAntes.branchId))
      ? elegidaAntes.branchId
      : undefined;
  const elegir = (valor: string) => {
    setElegida(valor);
    guardarEleccionDeSoporte(valor);
  };
  return (
    <div className="space-y-5">
      <PlatformPageHeader
        icon={<LifeBuoy size={22} />}
        title="Soporte"
        description="Entrá como un usuario de una farmacia para ver lo que ve y reproducir un problema."
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {reglas.map(({ icono: Icono, titulo, texto }) => (
          <li
            key={titulo}
            className="flex items-start gap-3 rounded-xl border border-niebla-913 bg-white/70 px-4 py-3"
          >
            <Icono
              size={18}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-marca-535"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800">
                {titulo}
              </span>
              <span className="block text-xs leading-5 text-slate-500">
                {texto}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {error && <PlatformError>{error}</PlatformError>}
      <PlatformPanel
        icon={<Search size={16} />}
        title="Farmacia y sucursal"
        description="Buscá la farmacia por su nombre. Si querés, después elegí una sucursal para ver solo a quienes trabajan ahí."
        bodyClassName="grid gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold text-slate-600">Farmacia</p>
          <SearchableSaleSelect
            label="Farmacia"
            placeholder="Escribí el nombre de la farmacia…"
            value={organizationId}
            options={farmacias}
            onChange={(valor) => elegir(valor)}
            floatingOptions
          />
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold text-slate-600">Sucursal</p>
          <ProductFilterSelect
            label="Sucursal"
            value={branchId ?? ""}
            options={opcionesDeSucursales(farmacia)}
            icon={<MapPin size={16} />}
            disabled={!farmacia}
            compact
            onChange={(valor) =>
              elegir(valorDeSoporte(organizationId, valor || undefined))
            }
          />
        </div>
      </PlatformPanel>
      {organizationId ? (
        <UsuariosDeFarmacia
          key={organizationId}
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          onVerificationExpired={onVerificationExpired}
        />
      ) : (
        <PlatformPanel
          icon={<Users size={16} />}
          title="Usuarios"
          bodyClassName=""
        >
          <PlatformEmpty icon={<Store size={22} />} title="Elegí una farmacia">
            Vas a ver sus usuarios activos y podés entrar como cualquiera de
            ellos.
          </PlatformEmpty>
        </PlatformPanel>
      )}
    </div>
  );
}

function UsuariosDeFarmacia({
  token,
  organizationId,
  branchId,
  onVerificationExpired,
}: {
  token: string;
  organizationId: string;
  /** Sólo los usuarios con acceso a esta sucursal. */
  branchId?: string;
  onVerificationExpired: () => void;
}) {
  const cargar = useCallback(
    () => getPlatformOrganization(token, organizationId),
    [token, organizationId],
  );
  const { data, error } = usePlatformData(cargar, onVerificationExpired);
  if (error) return <PlatformError>{error}</PlatformError>;
  if (!data)
    return (
      <PlatformPanel icon={<Users size={16} />} title="Usuarios">
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2].map((indice) => (
            <div
              key={indice}
              aria-hidden="true"
              className="h-[76px] animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none"
            />
          ))}
        </div>
        <p role="status" className="sr-only">
          Cargando usuarios…
        </p>
      </PlatformPanel>
    );
  const sucursal = branchId
    ? data.branches.find((branch) => branch.id === branchId)
    : undefined;
  const usuarios = (
    branchId
      ? data.users.filter((usuario) => usuario.branchIds?.includes(branchId))
      : data.users
  )
    .slice()
    // Primero los activos: son los únicos con los que se puede entrar.
    .sort((a, b) => Number(b.active) - Number(a.active));
  return (
    <PlatformPanel
      icon={<Users size={16} />}
      title={`${data.name}${sucursal ? ` · ${sucursal.name}` : ""}`}
      description={`${usuarios.length} ${usuarios.length === 1 ? "usuario" : "usuarios"}${sucursal ? " con acceso a esta sucursal" : ""}`}
      bodyClassName={usuarios.length === 0 ? "" : "p-4"}
    >
      {usuarios.length === 0 ? (
        <PlatformEmpty icon={<Users size={22} />} title="Sin usuarios">
          No hay usuarios con acceso a esta sucursal.
        </PlatformEmpty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {usuarios.map((usuario) => {
            const nombre = usuario.displayName || usuario.email;
            return (
              <li
                key={usuario.id}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${usuario.active ? "border-niebla-935 bg-white hover:border-marca-908 hover:bg-marca-985" : "border-dashed border-slate-200 bg-slate-50/60"}`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold tracking-wide ${usuario.active ? "bg-marca-958 text-marca-535" : "bg-slate-200 text-slate-500"}`}
                >
                  {iniciales(nombre)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {nombre}
                  </span>
                  {usuario.displayName && (
                    <span className="block truncate text-xs text-slate-500">
                      {usuario.email}
                    </span>
                  )}
                  <span className="mt-1 flex flex-wrap gap-1">
                    {(usuario.roles.length
                      ? usuario.roles.map(({ name }) => name)
                      : ["Sin rol"]
                    ).map((rol) => (
                      <span
                        key={rol}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
                      >
                        {rol}
                      </span>
                    ))}
                    {!usuario.active && (
                      <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                        Inactivo
                      </span>
                    )}
                  </span>
                </span>
                <BotonEntrarComo
                  organizationId={data.id}
                  organizationName={data.name}
                  usuario={usuario}
                  destacado
                />
              </li>
            );
          })}
        </ul>
      )}
    </PlatformPanel>
  );
}
