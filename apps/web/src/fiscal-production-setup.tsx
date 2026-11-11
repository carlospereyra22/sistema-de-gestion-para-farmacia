import { useEffect, useRef, useState } from "react";
import { FiscalCertificateSetup } from "./fiscal-certificate-setup";
import { ProductFilterSelect } from "./product-filter-select";
import { OperationConfirmDialog } from "./operation-confirm-dialog";
import { StatusToast } from "./status-toast";
import { ResultadoConexionArca } from "./resultado-conexion-arca";
import { formatearPunto } from "./lib/puntos-de-venta";
import {
  traducirErrorDeArca,
  type ResultadoDeConexion,
} from "./lib/errores-arca";
import {
  LO_HABILITA_EL_ADMINISTRADOR,
  REQUISITOS_REAL,
  mensajeDeActivacion,
} from "./lib/facturacion-real";
import {
  checkProductionConnection,
  getBranches,
  activateProduction,
  type BranchListItem,
} from "./lib/api";

/**
 * Facturación real (SISTEMA-98): certificado real, verificación con ARCA,
 * requisitos y activación con confirmación fuerte. La activación sigue
 * exigiendo en el servidor todo lo de siempre (flags incluidos).
 */
export function FiscalProductionSetup({
  token,
  organizationId,
  siempreAbierto = false,
  disponible = true,
  onActivado,
}: {
  token: string;
  organizationId: string;
  /** Último paso del asistente: sin el botón para abrir. */
  siempreAbierto?: boolean;
  /** El servidor permite la facturación real. */
  disponible?: boolean;
  onActivado?: () => void;
}) {
  const [abiertoAMano, setOpen] = useState(false);
  const open = siempreAbierto || abiertoAMano;
  const [branches, setBranches] = useState<BranchListItem[]>([]);
  const [branch, setBranch] = useState("");
  const [point, setPoint] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [requisitos, setRequisitos] = useState<boolean[]>(() =>
    REQUISITOS_REAL.map(() => false),
  );
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [resultado, setResultado] = useState<ResultadoDeConexion>();
  useEffect(() => {
    let active = true;
    void getBranches(token, organizationId)
      .then((items) => {
        if (active) setBranches(items);
      })
      .catch(() => {
        if (active) setBranches([]);
      });
    return () => {
      active = false;
    };
  }, [token, organizationId]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [points, setPoints] = useState<{ number: number }[]>();
  const pending = useRef(false);
  async function check() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setPoints(undefined);
    setResultado(undefined);
    setMessage("Comprobando el certificado real con ARCA…");
    try {
      await checkProductionConnection(token, organizationId, "authenticate");
      setMessage("Buscando tus puntos de venta reales…");
      const result = await checkProductionConnection(
        token,
        organizationId,
        "points",
      );
      setPoints(result.points ?? []);
      setMessage("Conexión real comprobada. No se emitió ninguna factura.");
    } catch (cause) {
      setMessage("");
      setResultado(traducirErrorDeArca(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const nombreSucursal = branches.find((b) => b.id === branch)?.name ?? "";
  const listos = requisitos.every(Boolean) && exclusive && !!branch && !!point;
  return (
    <section className="mt-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      {aviso && (
        <StatusToast key={aviso} message={aviso} onClose={() => setAviso("")} />
      )}
      {!siempreAbierto && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-teal-900">Facturación real</h3>
            <p className="mt-1 text-xs text-slate-600">
              Prepará el certificado real sin tocar los archivos de prueba.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="rounded-lg border border-teal-600 bg-white px-4 py-2 text-sm text-teal-800"
          >
            {open ? "Cerrar preparación" : "Preparar producción"}
          </button>
        </div>
      )}
      {open && (
        <div>
          <p className="text-sm text-slate-700">
            La facturación real usa otro certificado y otro punto de venta que
            el modo prueba. Activarla es un paso aparte y explícito, por
            sucursal.
          </p>
          <FiscalCertificateSetup
            key={organizationId}
            token={token}
            organizationId={organizationId}
            environment="PRODUCTION"
          />
          <div className="mt-4 rounded-xl border bg-white p-4">
            <h4 className="font-semibold">Verificar la conexión real</h4>
            <p className="mt-1 text-sm text-slate-600">
              Con el certificado real cargado y autorizado, buscamos tus puntos
              de venta en ARCA. No se crea nada ni se emite ninguna factura.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void check()}
              className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy ? "Verificando…" : "Verificar con ARCA"}
            </button>
            {message && (
              <p role="status" className="mt-3 text-sm">
                {message}
              </p>
            )}
            {resultado && <ResultadoConexionArca resultado={resultado} />}
            {points &&
              (points.length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {points.map((p) => (
                    <li key={p.number}>
                      Punto {formatearPunto(p.number)} · Web services
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  ARCA no tiene puntos de venta reales para este sistema. Creá
                  uno en ARCA («Administración de puntos de venta y domicilios»,
                  para «Factura electrónica - Web services»). No uses el número
                  de prueba.
                </p>
              ))}
          </div>
          {points && points.length > 0 && (
            <form
              className="mt-4 rounded-xl border bg-white p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (listos && disponible) setConfirmando(true);
              }}
            >
              <h4 className="font-semibold">Activar facturación real</h4>
              {!disponible && (
                <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  {LO_HABILITA_EL_ADMINISTRADOR} Mientras tanto podés dejar todo
                  preparado.
                </p>
              )}
              <fieldset className="mt-3 space-y-2">
                <legend className="text-sm font-medium text-slate-700">
                  Antes de activar
                </legend>
                {REQUISITOS_REAL.map((texto, indice) => (
                  <label key={texto} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-teal-700"
                      checked={requisitos[indice] ?? false}
                      onChange={(event) =>
                        setRequisitos((actuales) =>
                          actuales.map((valor, i) =>
                            i === indice ? event.target.checked : valor,
                          ),
                        )
                      }
                    />
                    {texto}
                  </label>
                ))}
              </fieldset>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="text-sm">
                  <p className="mb-1">Sucursal</p>
                  <ProductFilterSelect
                    compact
                    label="Sucursal"
                    icon={null}
                    disabled={busy}
                    value={branch}
                    options={[
                      { value: "", label: "Elegí una sucursal" },
                      ...branches
                        .filter((b) => b.active)
                        .map((b) => ({ value: b.id, label: b.name })),
                    ]}
                    onChange={setBranch}
                  />
                </div>
                <div className="text-sm">
                  <p className="mb-1">Punto de venta real</p>
                  <ProductFilterSelect
                    compact
                    label="Punto de venta real"
                    icon={null}
                    disabled={busy}
                    value={point}
                    options={[
                      { value: "", label: "Elegí un punto" },
                      ...points.map((p) => ({
                        value: String(p.number),
                        label: `${formatearPunto(p.number)} · Web services`,
                      })),
                    ]}
                    onChange={setPoint}
                  />
                </div>
              </div>
              <label className="mt-3 flex gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-teal-700"
                  checked={exclusive}
                  onChange={(e) => setExclusive(e.target.checked)}
                />
                Confirmo que el punto es exclusivo de esta sucursal y este
                sistema, y quiero emitir facturas reales.
              </label>
              <button
                type="submit"
                disabled={busy || !listos || !disponible}
                className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Activar facturación real
              </button>
              <p className="mt-2 text-xs text-slate-600">
                El servidor vuelve a revisar todo antes de activar. Las facturas
                de prueba siguen siendo de prueba.
              </p>
            </form>
          )}
          {confirmando && (
            <OperationConfirmDialog
              title="Activar facturación real"
              description={`Sucursal ${nombreSucursal}, punto de venta ${formatearPunto(Number(point))}. Desde ahora las facturas de esta sucursal tienen validez fiscal ante ARCA. No vuelve sola al modo prueba. Activar no emite ninguna factura.`}
              onConfirm={async () => {
                try {
                  await activateProduction(token, organizationId, {
                    branchId: branch,
                    point: Number(point),
                    exclusive,
                  });
                } catch (cause) {
                  throw new Error(mensajeDeActivacion(cause));
                }
                setAviso(
                  `Activaste la facturación real en ${nombreSucursal}. Volvé a abrir Ventas para usarla.`,
                );
                onActivado?.();
              }}
              onClose={() => setConfirmando(false)}
            />
          )}
        </div>
      )}
    </section>
  );
}
