import { useCallback, useContext, useMemo, useState } from "react";
import { LogIn, Search } from "lucide-react";
import {
  getPlatformOrganization,
  getPlatformOrganizations,
} from "./lib/platform-api";
import { usePlatformData } from "./lib/use-platform-data";
import {
  SoporteContext,
  filtrarFarmacias,
  type UsuarioDeFarmacia,
} from "./lib/soporte-panel";

/** Botón "Entrar como" de un usuario; no se muestra si el panel no lo ofrece. */
export function BotonEntrarComo({
  organizationId,
  organizationName,
  usuario,
}: {
  organizationId: string;
  organizationName: string;
  usuario: UsuarioDeFarmacia;
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
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-teal-800 hover:bg-teal-50 disabled:opacity-50"
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
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}

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
  const [texto, setTexto] = useState("");
  const [elegida, setElegida] = useState<string>();
  const farmacias = useMemo(
    () => filtrarFarmacias(data ?? [], texto),
    [data, texto],
  );
  return (
    <section>
      <h1 className="text-xl font-semibold">Soporte</h1>
      <p className="mt-1 text-sm text-slate-600">
        Entrá como un usuario de una farmacia para ver lo que ve y reproducir un
        problema. Volvés al panel con el botón de abajo a la izquierda.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <Search size={16} className="text-slate-400" aria-hidden="true" />
            <input
              aria-label="Buscar farmacia"
              placeholder="Buscar farmacia"
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              className="min-w-0 flex-1 text-sm outline-none"
            />
          </label>
          <ul className="mt-2 max-h-[60vh] overflow-y-auto">
            {farmacias.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  aria-current={elegida === f.id ? "true" : undefined}
                  onClick={() => setElegida(f.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${elegida === f.id ? "bg-teal-50 font-medium text-teal-800" : "hover:bg-slate-50"}`}
                >
                  {f.name}
                  <span className="block text-xs text-slate-500">
                    {f.activeUsers} usuarios · {f.activeBranches} sucursales
                  </span>
                </button>
              </li>
            ))}
            {data && farmacias.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">
                No hay farmacias con ese nombre.
              </li>
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          {elegida ? (
            <UsuariosDeFarmacia
              key={elegida}
              token={token}
              organizationId={elegida}
              onVerificationExpired={onVerificationExpired}
            />
          ) : (
            <p className="p-3 text-sm text-slate-500">
              Elegí una farmacia para ver sus usuarios.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function UsuariosDeFarmacia({
  token,
  organizationId,
  onVerificationExpired,
}: {
  token: string;
  organizationId: string;
  onVerificationExpired: () => void;
}) {
  const cargar = useCallback(
    () => getPlatformOrganization(token, organizationId),
    [token, organizationId],
  );
  const { data, error } = usePlatformData(cargar, onVerificationExpired);
  if (error)
    return (
      <p role="alert" className="p-3 text-sm text-red-700">
        {error}
      </p>
    );
  if (!data) return <p className="p-3 text-sm text-slate-500">Cargando…</p>;
  return (
    <>
      <h2 className="px-3 pt-1 font-semibold">{data.name}</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {data.users.map((usuario) => (
          <li
            key={usuario.id}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <span className="min-w-0 text-sm">
              <span className="block truncate font-medium text-slate-900">
                {usuario.displayName || usuario.email}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {usuario.email} ·{" "}
                {usuario.roles.map(({ name }) => name).join(", ") || "Sin rol"}
                {usuario.active ? "" : " · Inactivo"}
              </span>
            </span>
            <BotonEntrarComo
              organizationId={data.id}
              organizationName={data.name}
              usuario={usuario}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
