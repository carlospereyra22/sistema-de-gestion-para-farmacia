import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { getFiscalSetup, type FiscalSetup } from "./lib/api";
import { fiscalSteps, type FiscalStep } from "./lib/fiscal-wizard";
import { FiscalCertificateSetup } from "./fiscal-certificate-setup";
import { FiscalTesting } from "./fiscal-testing";

export function FiscalWizardSteps({
  step,
  onChange,
  disabled,
}: {
  step: FiscalStep;
  onChange: (step: FiscalStep) => void;
  disabled: boolean;
}) {
  return (
    <nav
      aria-label="Pasos para configurar facturación"
      className="my-5 grid gap-2 sm:grid-cols-4"
    >
      {fiscalSteps.map((label, index) => (
        <button
          type="button"
          key={label}
          disabled={disabled}
          aria-current={step === index ? "step" : undefined}
          onClick={() => onChange(index as FiscalStep)}
          className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${step === index ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        >
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs ${step === index ? "bg-teal-700 text-white" : "bg-slate-100"}`}
          >
            {index + 1}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

export function FiscalArcaGuide({
  token,
  organizationId,
  onLoaded,
  onEditProfile,
}: {
  token: string;
  organizationId: string;
  onLoaded: (data: FiscalSetup) => void;
  onEditProfile: () => void;
}) {
  const [data, setData] = useState<FiscalSetup>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    let active = true;
    void getFiscalSetup(token, organizationId)
      .then((value) => {
        if (active) {
          setData(value);
          setError("");
          onLoaded(value);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setData(undefined);
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos revisar la configuración. Intentá nuevamente.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, revision, onLoaded]);
  const profile = data?.checks.find((check) => check.code === "PROFILE");
  return (
    <section
      className="rounded-xl border border-slate-200 p-5"
      aria-busy={loading}
    >
      <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">
        Vamos a preparar la conexión
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        Revisamos los datos guardados de tu farmacia. No hace falta que ingreses
        números de punto de venta ni claves fiscales.
      </p>
      <div role="status" aria-live="polite" className="mt-5">
        {loading ? (
          <p className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
            <RefreshCw size={18} className="animate-spin" />
            Revisando configuración guardada…
          </p>
        ) : error ? (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            {error}
          </p>
        ) : (
          data && <FiscalConnectionStatus checks={data.checks} />
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {!loading && !error && profile && !profile.ready && (
          <button
            type="button"
            onClick={onEditProfile}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm text-white"
          >
            <ArrowLeft size={16} />
            Completar datos de mi farmacia
          </button>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setError("");
            setRevision((value) => value + 1);
          }}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm text-teal-800 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          {error ? "Reintentar" : "Volver a comprobar"}
        </button>
      </div>
      <FiscalTesting
        token={token}
        organizationId={organizationId}
        onConnected={() => setRevision((value) => value + 1)}
      />
      <FiscalCertificateSetup
        key={organizationId}
        token={token}
        organizationId={organizationId}
      />
      <details className="mt-5 border-t pt-4 text-sm">
        <summary className="cursor-pointer text-slate-600">
          Información para tu contador o soporte técnico
        </summary>
        <p className="mt-3 leading-6 text-slate-600">
          Probar conexión consulta WSAA y WSFE en homologación. Las pruebas
          utilizan artículos ficticios y no afectan ventas, stock ni caja.
          Generar una solicitud o validar archivos no autoriza el servicio.
          Producción continúa bloqueada; sus certificados y puntos son
          independientes.
        </p>
        <a
          href="https://www.arca.gob.ar/ws/documentacion/certificados.asp"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-teal-700 underline"
        >
          Documentación oficial de ARCA
          <ExternalLink size={15} />
        </a>
      </details>
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <LockKeyhole size={15} />
        Tu clave fiscal no se pide ni se guarda aquí.
      </p>
    </section>
  );
}

export function FiscalConnectionStatus({
  checks,
}: {
  checks: FiscalSetup["checks"];
}) {
  const profile = checks.find((check) => check.code === "PROFILE");
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {profile?.ready && (
            <CheckCircle2 size={18} className="text-teal-700" />
          )}
          {profile?.ready
            ? "Tus datos básicos ya están cargados"
            : "Primero necesitamos completar tus datos"}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {profile?.ready
            ? "No necesitás volver a escribirlos."
            : (profile?.detail ??
              "No pudimos determinar el estado de los datos. Volvé a comprobar.")}
        </p>
      </div>
      <div className="rounded-xl bg-amber-50 p-4 text-amber-950">
        <p className="text-sm font-semibold">Probá tu certificado con ARCA</p>
        <p className="mt-2 text-sm leading-6">
          Si ya cargaste el certificado, usá «Probar conexión con ARCA» abajo.
          El sistema consulta los puntos habilitados y permite enviar una
          factura ficticia a homologación. Si todavía no tenés certificado,
          preparalo al final de esta pantalla.
        </p>
        <p className="mt-2 text-xs">
          Las pruebas no tienen validez fiscal. La facturación real en Ventas
          sigue bloqueada; el ticket interno continúa disponible.
        </p>
      </div>
    </div>
  );
}
