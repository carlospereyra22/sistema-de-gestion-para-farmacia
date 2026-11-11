import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Info,
  Lock,
} from "lucide-react";
import type { FiscalSetup } from "./lib/api";
import {
  estadoDeFacturacion,
  type EstadoDelPaso,
} from "./lib/estado-facturacion";
import type { FiscalStep } from "./lib/fiscal-wizard";

const iconos: Record<EstadoDelPaso, ReactElement> = {
  completo: <CheckCircle2 size={18} aria-hidden="true" />,
  pendiente: <Circle size={18} aria-hidden="true" />,
  problema: <AlertTriangle size={18} aria-hidden="true" />,
  bloqueado: <Lock size={18} aria-hidden="true" />,
};
const colores: Record<EstadoDelPaso, string> = {
  completo: "border-teal-200 bg-teal-50 text-teal-800",
  pendiente: "border-slate-200 bg-white text-slate-600",
  problema: "border-amber-200 bg-amber-50 text-amber-900",
  bloqueado: "border-slate-200 bg-slate-50 text-slate-400",
};
const textoEstado: Record<EstadoDelPaso, string> = {
  completo: "completo",
  pendiente: "pendiente",
  problema: "con problema",
  bloqueado: "bloqueado",
};

/** Etiqueta corta del modo prueba, con el detalle desplegable. */
export function ModoPrueba(): ReactElement {
  return (
    <details className="group mt-3 text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-medium text-amber-900">
        <Info size={14} aria-hidden="true" />
        Modo prueba: las facturas no tienen validez fiscal
        <span className="text-xs font-normal underline">¿Qué significa?</span>
      </summary>
      <p className="mt-2 max-w-3xl rounded-lg bg-amber-50/60 p-3 leading-6 text-amber-950">
        Mientras no actives la facturación real, las facturas se hacen en el
        ambiente de prueba de ARCA: tienen número y código de autorización pero
        no valen ante ARCA. Las ventas con factura de prueba sí mueven el stock
        y la caja de este sistema. El ticket interno sigue disponible.
      </p>
    </details>
  );
}

/**
 * Tarjeta de entrada a Facturación (SISTEMA-95): en qué estado está y qué
 * hacer después, en 5 segundos. El estado sale sólo del servidor.
 */
export function EstadoFacturacion({
  setup,
  vatCondition,
  onAbrir,
}: {
  setup?: FiscalSetup;
  vatCondition?: string;
  /** Abre el asistente en ese paso. */
  onAbrir: (paso: FiscalStep) => void;
}): ReactElement {
  if (!setup)
    return (
      <section
        aria-busy="true"
        className="mt-5 rounded-xl border border-slate-200 p-5"
      >
        <p className="text-sm text-slate-500">
          Revisando el estado de la facturación…
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((indice) => (
            <div
              key={indice}
              className="h-16 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      </section>
    );
  const estado = estadoDeFacturacion(setup, vatCondition);
  const siguiente =
    estado.siguiente === undefined ? undefined : estado.pasos[estado.siguiente];
  return (
    <section className="mt-5 rounded-xl border border-teal-100 bg-teal-50/40 p-5">
      <h3 className="text-lg font-semibold text-slate-900">{estado.titulo}</h3>
      <ol
        aria-label="Pasos de la facturación"
        className="mt-4 grid gap-2 sm:grid-cols-5"
      >
        {estado.pasos.map((paso) => (
          <li key={paso.paso}>
            <button
              type="button"
              disabled={paso.estado === "bloqueado"}
              onClick={() => onAbrir(paso.paso)}
              aria-label={`${paso.paso + 1}. ${paso.nombre}: ${textoEstado[paso.estado]}`}
              title={paso.detalle}
              className={`flex h-full w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm ${colores[paso.estado]} ${paso.estado === "bloqueado" ? "cursor-not-allowed" : "hover:border-teal-400"}`}
            >
              <span className="mt-0.5 shrink-0">{iconos[paso.estado]}</span>
              <span className="min-w-0">
                <span className="block font-medium">
                  {paso.paso + 1}. {paso.nombre}
                </span>
                <span className="block text-xs opacity-80">
                  {textoEstado[paso.estado]}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="Avance de la facturación"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={estado.porcentaje}
      >
        <div
          className="h-full rounded-full bg-teal-600"
          style={{ width: `${estado.porcentaje}%` }}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          {siguiente
            ? `Próximo: ${siguiente.nombre}. ${siguiente.detalle}`
            : "Ya podés vender con Factura desde Ventas."}
        </p>
        <button
          type="button"
          onClick={() => onAbrir(estado.siguiente ?? 0)}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          {siguiente
            ? `Continuar: ${siguiente.nombre}`
            : "Revisar la configuración"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
      {estado.pasos[4]!.estado === "bloqueado" && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Lock size={13} aria-hidden="true" />
          {estado.pasos[4]!.detalle}
        </p>
      )}
    </section>
  );
}

/**
 * Pantalla final (SISTEMA-98): qué puede hacer ahora y cómo volver a revisar
 * la configuración.
 */
export function FacturacionLista({
  real,
  onSeguir,
  onResumen,
}: {
  /** Ya factura en real (si no, quedó lista en modo prueba). */
  real: boolean;
  /** Seguir con la facturación real (sólo en modo prueba). */
  onSeguir?: () => void;
  onResumen: () => void;
}): ReactElement {
  return (
    <section className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-6 text-center">
      <CheckCircle2
        size={36}
        className="mx-auto text-teal-700"
        aria-hidden="true"
      />
      <h3 className="mt-3 text-xl font-semibold text-teal-900">¡Listo!</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-700">
        {real
          ? "Tu farmacia ya factura en real. En Ventas elegí «Factura» al cobrar: el comprobante sale con su código de autorización (CAE) y el QR de ARCA."
          : "Tu farmacia ya puede facturar en modo prueba. En Ventas elegí «Factura · prueba» al cobrar: mueve stock y caja de este sistema, pero la factura no tiene validez fiscal."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link
          to={{ search: "?pagina=ventas" }}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white"
        >
          Ir a Ventas
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        {!real && onSeguir && (
          <button
            type="button"
            onClick={onSeguir}
            className="rounded-lg border border-teal-600 bg-white px-4 py-2.5 text-sm text-teal-800"
          >
            Seguir: Facturación real
          </button>
        )}
        <button
          type="button"
          onClick={onResumen}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700"
        >
          Revisar la configuración
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Podés volver a esta sección cuando quieras desde Organización →
        Facturación.
      </p>
    </section>
  );
}
