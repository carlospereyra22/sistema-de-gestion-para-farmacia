import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Plus, RefreshCw } from "lucide-react";
import { getFiscalSetup, saveFiscalPoint, type FiscalSetup } from "./lib/api";

export function FiscalSetupPanel({
  token,
  organizationId,
  revision,
  onLoaded,
  pointsOnly = false,
}: {
  token: string;
  organizationId: string;
  revision: number;
  onLoaded?: (data: FiscalSetup) => void;
  pointsOnly?: boolean;
}) {
  const [data, setData] = useState<FiscalSetup>();
  const [branchId, setBranchId] = useState("");
  const [number, setNumber] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void getFiscalSetup(token, organizationId)
      .then((value) => {
        if (active) {
          setData(value);
          setBranchId((current) =>
            value.branches.some((branch) => branch.id === current)
              ? current
              : value.branches.length === 1
                ? value.branches[0]!.id
                : "",
          );
          onLoaded?.(value);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : "No se pudo cargar.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, revision, refresh, onLoaded]);
  async function save(
    input:
      { branchId: string; number: number } | { id: string; active: boolean },
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await saveFiscalPoint(token, organizationId, input);
      setMessage(
        "Configuración local guardada. Esto no da de alta ni verifica el punto en ARCA.",
      );
      setRefresh((value) => value + 1);
      if (!("id" in input)) setNumber("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo guardar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {pointsOnly ? "Dónde vas a facturar" : "Preparación para pruebas"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Homologación · Estos puntos son sólo de prueba
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
        >
          <RefreshCw size={14} />
          Actualizar estado local
        </button>
      </div>
      {!data && !message && (
        <p className="mt-4 text-sm">Cargando preparación fiscal…</p>
      )}
      {data && (
        <>
          {!pointsOnly && <FiscalChecklist checks={data.checks} />}
          <div className="mt-5 border-t pt-4">
            <h4 className="text-sm font-semibold">
              Puntos de venta por sucursal
            </h4>
            <p className="mt-2 rounded-lg bg-teal-50 p-3 text-sm leading-6 text-teal-900">
              En Conexión ARCA podés consultar los puntos disponibles y emitir
              una prueba. La asociación a una sucursal se guarda acá; no crea un
              punto real en ARCA. Podés dejar este paso pendiente para probar.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {data.branches.length === 1
                ? `Sucursal detectada: ${data.branches[0]!.name}.`
                : `${data.branches.length} sucursales activas detectadas.`}{" "}
              No se asoció ningún número automáticamente.
            </p>
            <button
              type="button"
              aria-expanded={manual}
              onClick={() => setManual((value) => !value)}
              className="mt-4 text-xs text-slate-600 underline"
            >
              {manual
                ? "Ocultar carga manual"
                : "Opciones avanzadas: ya conozco mi punto de prueba"}
            </button>
            {manual && (
              <>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Sólo para configuración asistida por soporte. Guardar un
                  número aquí no lo registra ni verifica en ARCA. No se reasigna
                  a otra sucursal.
                </p>
                <form
                  className="mt-3 flex flex-wrap items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save({ branchId, number: Number(number) });
                  }}
                >
                  <label className="min-w-48 flex-1 text-xs">
                    Sucursal
                    <select
                      required
                      disabled={busy}
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      className="mt-1 block h-10 w-full rounded-lg border bg-white px-3"
                    >
                      <option value="">Seleccionar sucursal</option>
                      {data.branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Punto de venta
                    <input
                      required
                      disabled={busy}
                      type="number"
                      min={1}
                      max={99999}
                      step={1}
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      className="mt-1 block h-10 w-36 rounded-lg border px-3"
                      placeholder="Número confirmado"
                    />
                  </label>
                  <button
                    disabled={busy || !data.branches.length}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-xs text-white disabled:opacity-50"
                  >
                    <Plus size={16} />
                    Asociar punto
                  </button>
                </form>
              </>
            )}
            <div className="mt-4 space-y-2">
              {data.points.map((point) => (
                <div
                  key={point.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div>
                    <strong>{String(point.number).padStart(5, "0")}</strong>
                    <span className="ml-3">
                      {data.branches.find((b) => b.id === point.branchId)
                        ?.name ?? "Sucursal inactiva"}
                    </span>
                    <span className="ml-3 text-xs text-slate-500">
                      {point.active ? "Configurado localmente" : "Desactivado"}{" "}
                      · Sin verificar en ARCA
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void save({ id: point.id, active: !point.active })
                    }
                    className="rounded-lg border px-3 py-2 text-xs"
                  >
                    {point.active ? "Desactivar" : "Reactivar"}
                  </button>
                </div>
              ))}
              {!data.points.length && (
                <p className="text-sm text-slate-500">
                  Todavía no hay puntos asociados.
                </p>
              )}
            </div>
          </div>
        </>
      )}
      {message && (
        <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}

export function FiscalChecklist({ checks }: { checks: FiscalSetup["checks"] }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {checks
        .filter((check) => check.code !== "ISSUANCE")
        .map((check) => (
          <div
            key={check.code}
            className="flex items-start gap-3 rounded-lg bg-slate-50 p-3"
          >
            {check.ready ? (
              <CheckCircle2
                size={18}
                className="shrink-0 text-teal-700"
                aria-label="Configurado localmente"
              />
            ) : (
              <Circle
                size={18}
                className="shrink-0 text-amber-600"
                aria-label="Pendiente"
              />
            )}
            <div>
              <p className="text-sm font-semibold">{check.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {check.detail}
              </p>
            </div>
          </div>
        ))}
    </div>
  );
}
