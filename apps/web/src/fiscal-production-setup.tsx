import { useEffect, useRef, useState } from "react";
import { FiscalCertificateSetup } from "./fiscal-certificate-setup";
import { ProductFilterSelect } from "./product-filter-select";
import {
  checkProductionConnection,
  getBranches,
  activateProduction,
  type BranchListItem,
} from "./lib/api";

export function FiscalProductionSetup({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<BranchListItem[]>([]);
  const [branch, setBranch] = useState("");
  const [point, setPoint] = useState("");
  const [exclusive, setExclusive] = useState(false);
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
    try {
      setMessage("Comprobando certificado en producción…");
      await checkProductionConnection(token, organizationId, "authenticate");
      setMessage("Consultando autorización WSFE y puntos de venta…");
      const result = await checkProductionConnection(
        token,
        organizationId,
        "points",
      );
      setPoints(result.points ?? []);
      setMessage(
        "Conexión de producción comprobada. No se emitieron facturas.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo verificar la conexión.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="mt-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-teal-900">
            Facturación real · Producción
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Prepará el certificado del servidor sin modificar tus archivos de
            pruebas.
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
      {open && (
        <div>
          <p className="mt-4 text-sm text-slate-700">
            Primero guardá los datos fiscales del emisor en el asistente. Esta
            sección prepara el acceso real a ARCA. La activación final de una
            sucursal es un paso separado y explícito.
          </p>
          <FiscalCertificateSetup
            key={organizationId}
            token={token}
            organizationId={organizationId}
            environment="PRODUCTION"
          />
          <div className="mt-4 rounded-xl border bg-white p-4">
            <h4 className="font-semibold">4. Verificar producción</h4>
            <p className="mt-1 text-sm text-slate-600">
              Con el certificado cargado y autorizado, consultamos los puntos de
              venta disponibles. No se crea ningún punto ni comprobante.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void check()}
              className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy ? "Verificando…" : "Verificar producción"}
            </button>
            {message && (
              <p role="status" className="mt-3 text-sm">
                {message}
              </p>
            )}
            {points &&
              (points.length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {points.map((point) => (
                    <li key={point.number}>
                      Punto {String(point.number).padStart(5, "0")} · disponible
                      para CAE
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-amber-800">
                  ARCA no devolvió puntos disponibles. Revisá el alta para Web
                  Services en el portal; no uses el número de pruebas.
                </p>
              ))}
          </div>
          {points && points.length > 0 && (
            <form
              className="mt-4 rounded-xl border bg-white p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (pending.current) return;
                pending.current = true;
                setBusy(true);
                void activateProduction(token, organizationId, {
                  branchId: branch,
                  point: Number(point),
                  exclusive,
                })
                  .then(() =>
                    setMessage(
                      "Producción activada para la sucursal. Volvé a abrir Ventas para cargar su configuración. No se emitieron comprobantes al activar.",
                    ),
                  )
                  .catch((cause: unknown) =>
                    setMessage(
                      cause instanceof Error
                        ? cause.message
                        : "No se pudo activar.",
                    ),
                  )
                  .finally(() => {
                    pending.current = false;
                    setBusy(false);
                  });
              }}
            >
              <h4 className="font-semibold">5. Activar facturación real</h4>
              <div className="mt-3 text-sm">
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
              <div className="mt-3 text-sm">
                <p className="mb-1">Punto de venta productivo</p>
                <ProductFilterSelect
                  compact
                  label="Punto de venta productivo"
                  icon={null}
                  disabled={busy}
                  value={point}
                  options={[
                    { value: "", label: "Elegí un punto verificado" },
                    ...points.map((p) => ({
                      value: String(p.number),
                      label: String(p.number).padStart(5, "0"),
                    })),
                  ]}
                  onChange={setPoint}
                />
              </div>
              <label className="mt-3 flex gap-2 text-sm">
                <input
                  required
                  type="checkbox"
                  checked={exclusive}
                  onChange={(e) => setExclusive(e.target.checked)}
                />
                Confirmo que el punto es exclusivo de esta sucursal y este
                sistema, y quiero emitir facturas reales.
              </label>
              <button
                type="submit"
                disabled={busy || !exclusive || !branch || !point}
                className="mt-3 rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50"
              >
                Activar producción
              </button>
              <p className="mt-2 text-xs text-slate-600">
                El servidor verifica perfil, certificado, punto y habilitación
                operativa. No se convierte ninguna factura de prueba. Requiere
                respaldo y recuperación verificados.
              </p>
            </form>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Las facturas anteriores de homologación conservan su condición de
            prueba. Sólo una sucursal activada podrá elegir facturación real; si
            falla su configuración, no se vuelve a pruebas automáticamente.
          </p>
        </div>
      )}
    </section>
  );
}
