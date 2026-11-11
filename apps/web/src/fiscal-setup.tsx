import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Plus, RefreshCw, Search } from "lucide-react";
import {
  fiscalTesting,
  getFiscalSetup,
  saveFiscalPoint,
  type FiscalConnection,
  type FiscalSetup,
} from "./lib/api";
import {
  filasDePuntos,
  formatearPunto,
  opcionesDePuntosArca,
} from "./lib/puntos-de-venta";
import {
  traducirErrorDeArca,
  type ResultadoDeConexion,
} from "./lib/errores-arca";
import { ProductFilterSelect } from "./product-filter-select";
import { ResultadoConexionArca } from "./resultado-conexion-arca";
import { StatusToast } from "./status-toast";

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
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [aviso, setAviso] = useState("");
  /** Sucursal a la que se le está asignando un punto. */
  const [asignando, setAsignando] = useState<string>();
  const [numero, setNumero] = useState("");
  /** Puntos que informó ARCA (vacío: ARCA respondió sin puntos, 602). */
  const [deArca, setDeArca] = useState<{ number: number }[]>();
  const [resultado, setResultado] = useState<ResultadoDeConexion>();
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void getFiscalSetup(token, organizationId)
      .then((value) => {
        if (active) {
          setData(value);
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
    hecho: string,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await saveFiscalPoint(token, organizationId, input);
      setAviso(hecho);
      setRefresh((value) => value + 1);
      setAsignando(undefined);
      setNumero("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo guardar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function buscarEnArca() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setResultado(undefined);
    try {
      const conexion = await fiscalTesting<FiscalConnection>(
        token,
        organizationId,
        "connect",
        {},
      );
      setDeArca(conexion.points);
    } catch (cause) {
      setResultado(traducirErrorDeArca(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      {aviso && (
        <StatusToast key={aviso} message={aviso} onClose={() => setAviso("")} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {pointsOnly ? "Punto de venta" : "Preparación para pruebas"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Es el número que ARCA asigna para facturar. Cada sucursal necesita
            el suyo.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Modo prueba · Estos puntos son sólo de prueba
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Actualizar
        </button>
      </div>
      {!data && !message && (
        <p className="mt-4 text-sm">Cargando preparación fiscal…</p>
      )}
      {data && (
        <>
          {!pointsOnly && <FiscalChecklist checks={data.checks} />}
          <PuntosPorSucursal
            setup={data}
            busy={busy}
            asignando={asignando}
            numero={numero}
            deArca={deArca}
            resultado={resultado}
            onAsignar={(branchId) => {
              setAsignando(branchId);
              setNumero("");
            }}
            onCancelar={() => setAsignando(undefined)}
            onNumero={setNumero}
            onBuscarEnArca={() => void buscarEnArca()}
            onGuardar={(branchId, branchName) =>
              void save(
                { branchId, number: Number(numero) },
                `Le asignaste el punto ${formatearPunto(Number(numero))} a ${branchName}.`,
              )
            }
            onCambiarEstado={(point, branchName) =>
              void save(
                { id: point.id, active: !point.active },
                point.active
                  ? `Desactivaste el punto ${formatearPunto(point.number)} de ${branchName}.`
                  : `Reactivaste el punto ${formatearPunto(point.number)} de ${branchName}.`,
              )
            }
          />
        </>
      )}
      {message && (
        <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}

/**
 * Una fila por sucursal con su punto o "Sin asignar" (SISTEMA-98). Sin
 * estado propio: lo maneja FiscalSetupPanel.
 */
export function PuntosPorSucursal({
  setup,
  busy,
  asignando,
  numero,
  deArca,
  resultado,
  onAsignar,
  onCancelar,
  onNumero,
  onBuscarEnArca,
  onGuardar,
  onCambiarEstado,
}: {
  setup: FiscalSetup;
  busy: boolean;
  asignando?: string;
  numero: string;
  deArca?: { number: number }[];
  resultado?: ResultadoDeConexion;
  onAsignar: (branchId: string) => void;
  onCancelar: () => void;
  onNumero: (valor: string) => void;
  onBuscarEnArca: () => void;
  onGuardar: (branchId: string, branchName: string) => void;
  onCambiarEstado: (
    point: FiscalSetup["points"][number],
    branchName: string,
  ) => void;
}) {
  const filas = filasDePuntos(setup);
  const opciones = deArca ? opcionesDePuntosArca(deArca, setup.points) : [];
  if (!filas.length)
    return (
      <p className="mt-4 text-sm text-slate-500">
        No hay sucursales activas. Crealas en Organización → Sucursales.
      </p>
    );
  return (
    <ul className="mt-4 space-y-2" aria-label="Puntos de venta por sucursal">
      {filas.map((fila) => (
        <li key={fila.branch.id} className="rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {fila.activo ? (
                <CheckCircle2
                  size={18}
                  className="text-teal-700"
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  size={18}
                  className="text-slate-400"
                  aria-hidden="true"
                />
              )}
              <span className="font-medium">{fila.branch.name}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs ${fila.activo ? "bg-teal-50 font-semibold text-teal-800" : "bg-slate-100 text-slate-600"}`}
              >
                {fila.activo
                  ? `Punto ${formatearPunto(fila.activo.number)}`
                  : "Sin asignar"}
              </span>
            </div>
            {fila.activo ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onCambiarEstado(fila.activo!, fila.branch.name)}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                Desactivar
              </button>
            ) : (
              asignando !== fila.branch.id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAsignar(fila.branch.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white"
                >
                  <Plus size={14} aria-hidden="true" />
                  Asignar
                </button>
              )
            )}
          </div>
          {fila.inactivos.map((punto) => (
            <div
              key={punto.id}
              className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-8 text-xs text-slate-500"
            >
              <span>Punto {formatearPunto(punto.number)} · desactivado</span>
              <button
                type="button"
                disabled={busy || !!fila.activo}
                title={
                  fila.activo
                    ? "Primero desactivá el punto que está en uso."
                    : undefined
                }
                onClick={() => onCambiarEstado(punto, fila.branch.name)}
                className="rounded-lg border px-2.5 py-1.5"
              >
                Reactivar
              </button>
            </div>
          ))}
          {asignando === fila.branch.id && (
            <form
              className="mt-3 rounded-lg bg-slate-50 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                onGuardar(fila.branch.id, fila.branch.name);
              }}
            >
              {!deArca && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onBuscarEnArca}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-teal-600 bg-white px-3 text-sm text-teal-800"
                  >
                    <Search size={15} aria-hidden="true" />
                    {busy ? "Buscando…" : "Buscar mis puntos en ARCA"}
                  </button>
                  <span className="text-xs text-slate-500">
                    Necesita la conexión con ARCA del paso anterior.
                  </span>
                </div>
              )}
              {resultado && <ResultadoConexionArca resultado={resultado} />}
              {deArca && opciones.length > 0 && (
                <div className="max-w-sm text-sm">
                  <p className="mb-1">Punto de venta</p>
                  <ProductFilterSelect
                    compact
                    label="Punto de venta"
                    icon={null}
                    disabled={busy}
                    value={numero}
                    options={[
                      { value: "", label: "Elegí un punto" },
                      ...opciones,
                    ]}
                    onChange={onNumero}
                  />
                </div>
              )}
              {deArca && opciones.length === 0 && (
                <div className="text-sm">
                  <p className="rounded-lg bg-amber-50 p-3 leading-6 text-amber-950">
                    ARCA todavía no tiene puntos de venta para este sistema. En
                    modo prueba es normal: escribí un número (por ejemplo 1).
                    Para facturar en real vas a tener que crear uno en ARCA:
                    «Administración de puntos de venta y domicilios» → nuevo
                    punto para «Factura electrónica - Web services».
                  </p>
                  <label className="mt-3 block max-w-48 text-xs font-medium text-slate-600">
                    Número de punto de venta
                    <input
                      required
                      type="number"
                      min={1}
                      max={99999}
                      step={1}
                      disabled={busy}
                      value={numero}
                      onChange={(event) => onNumero(event.target.value)}
                      className="mt-1 block h-10 w-full rounded-lg border px-3 text-sm"
                      placeholder="Por ejemplo: 1"
                    />
                  </label>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {deArca && (
                  <button
                    type="submit"
                    disabled={busy || !numero}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm text-white disabled:opacity-50"
                  >
                    Asignar a {fila.branch.name}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={onCancelar}
                  className="h-10 rounded-lg border bg-white px-4 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </li>
      ))}
    </ul>
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
