import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, FileCheck2, Lock, ShieldAlert } from "lucide-react";
import {
  fiscalSettings,
  getTicketHeader,
  type FiscalProfile,
  type FiscalSetup,
} from "./lib/api";
import { logoPreview } from "./lib/ticket-logo";
import { FiscalSetupPanel } from "./fiscal-setup";
import { FiscalArcaGuide, FiscalWizardSteps } from "./fiscal-wizard-guide";
import { fiscalSteps, type FiscalStep } from "./lib/fiscal-wizard";
import { estadoDeFacturacion } from "./lib/estado-facturacion";
import {
  EstadoFacturacion,
  FacturacionLista,
  ModoPrueba,
} from "./fiscal-estado";
import { FiscalTesting } from "./fiscal-testing";
import { FiscalProductionSetup } from "./fiscal-production-setup";
import { formatearCuit } from "./lib/cuit";
import { BUSQUEDA_ARCA } from "./lib/funciones-ocultas";
import { DatosDeLaFarmacia } from "./fiscal-datos-farmacia";
import { StatusToast } from "./status-toast";

export function FiscalSettingsPanel(props: {
  token: string;
  organizationId: string;
}) {
  return <FiscalSettingsContent key={props.organizationId} {...props} />;
}

function FiscalSettingsContent({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [profile, setProfile] = useState<FiscalProfile>();
  const [logo, setLogo] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  /** Aviso emergente al guardar. */
  const [aviso, setAviso] = useState("");
  const dirty = useRef(false);
  const pending = useRef(false);
  const [revision, setRevision] = useState(0);
  const [step, setStep] = useState<FiscalStep>(0);
  const [started, setStarted] = useState(false);
  const [setup, setSetup] = useState<FiscalSetup>();
  const [reload, setReload] = useState(0);
  const onSetupLoaded = useCallback(
    (value: FiscalSetup) => setSetup(value),
    [],
  );
  const estado = setup
    ? estadoDeFacturacion(setup, profile?.vatCondition)
    : undefined;
  function navigate(next: FiscalStep) {
    if (dirty.current && next !== 0) {
      setMessage(
        "Tenés datos fiscales sin guardar. Guardalos antes de continuar.",
      );
      return;
    }
    setMessage("");
    setStep(next);
  }
  useEffect(() => {
    let active = true;
    void fiscalSettings(token, organizationId)
      .then((data) => {
        if (active && !dirty.current) setProfile(data.profile);
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : "No se pudo cargar.",
          );
      });
    void getTicketHeader(token, organizationId)
      .then((data) => {
        if (active) setLogo(data.logoRaster);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token, organizationId, reload]);
  useEffect(() => {
    function warnUnsaved(event: BeforeUnloadEvent) {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, []);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      {aviso && (
        <StatusToast key={aviso} message={aviso} onClose={() => setAviso("")} />
      )}
      <h2 className="flex items-center gap-2 font-semibold">
        <FileCheck2 size={20} className="text-teal-700" />
        Facturación electrónica
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Dejá lista tu farmacia para facturar en ARCA, paso a paso.
      </p>
      {!started ||
      !estado?.pasos[4] ||
      estado.pasos[4].estado !== "completo" ? (
        <ModoPrueba />
      ) : null}
      {!started && (
        <>
          <EstadoFacturacion
            setup={setup}
            vatCondition={profile?.vatCondition}
            onAbrir={(paso) => {
              // Con datos sin guardar se vuelve al primer paso.
              setStep(dirty.current ? 0 : paso);
              setStarted(true);
            }}
          />
          {dirty.current && (
            <p className="mt-3 text-sm text-amber-800">
              Tenés datos sin guardar. Al continuar volverás al primer paso.
            </p>
          )}
        </>
      )}
      {started && (
        <FiscalWizardSteps step={step} onChange={navigate} disabled={busy} />
      )}
      <div hidden={!started || step !== 0}>
        <h3 className="mt-5 font-semibold">Datos de la farmacia</h3>
        <p className="mt-1 text-xs text-slate-500">
          Copialos de la constancia de inscripción de ARCA: razón social,
          domicilio fiscal y condición frente al IVA.
        </p>
        {profile && (
          <div className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <DatosDeLaFarmacia
              token={token}
              organizationId={organizationId}
              profile={profile}
              busy={busy}
              buscarEnArca={BUSQUEDA_ARCA}
              onChange={(next) => {
                dirty.current = true;
                setProfile(next);
                setMessage("");
              }}
              onGuardar={(continuar) => {
                if (pending.current) return;
                pending.current = true;
                setBusy(true);
                setMessage("");
                void fiscalSettings(token, organizationId, profile)
                  .then((result) => {
                    setProfile(result.profile);
                    dirty.current = false;
                    setRevision((value) => value + 1);
                    setAviso("Guardaste los datos de la farmacia.");
                    if (continuar) setStep(1);
                  })
                  .catch((error: unknown) =>
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "No se pudo guardar.",
                    ),
                  )
                  .finally(() => {
                    pending.current = false;
                    setBusy(false);
                  });
              }}
            />
            <InvoiceDesignPreview profile={profile} logo={logo} />
          </div>
        )}
      </div>
      {!profile && !message && (
        <p className="mt-4 text-sm">Cargando configuración…</p>
      )}
      {message && (
        <p role="status" className="mt-4 rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
      {!profile && message && (
        <button
          type="button"
          onClick={() => {
            setMessage("");
            setReload((value) => value + 1);
          }}
          className="mt-3 rounded-lg border px-4 py-2 text-sm"
        >
          Reintentar carga
        </button>
      )}
      <div hidden={!started || step !== 2}>
        <FiscalSetupPanel
          token={token}
          organizationId={organizationId}
          revision={revision}
          onLoaded={onSetupLoaded}
          pointsOnly={started}
        />
      </div>
      {started && step === 1 && (
        <FiscalArcaGuide
          token={token}
          organizationId={organizationId}
          onLoaded={onSetupLoaded}
          onEditProfile={() => navigate(0)}
        />
      )}
      {started && step === 3 && estado?.pasos[3]?.estado === "completo" && (
        <FacturacionLista
          real={false}
          onSeguir={() => navigate(4)}
          onResumen={() => setStarted(false)}
        />
      )}
      {started && step === 3 && (
        <FiscalTesting
          token={token}
          organizationId={organizationId}
          modo="prueba"
          puntos={
            setup?.points
              .filter((point) => point.active)
              .map(({ number }) => number) ?? []
          }
          emisor={
            profile
              ? { nombre: profile.legalName, cuit: profile.cuit }
              : undefined
          }
          onTrial={() => setRevision((value) => value + 1)}
        />
      )}
      {started && step === 4 && estado?.pasos[4]?.estado === "completo" && (
        <FacturacionLista real onResumen={() => setStarted(false)} />
      )}
      {started && step === 4 && (
        <PasoFacturacionReal
          token={token}
          organizationId={organizationId}
          bloqueo={
            estado?.pasos[4]?.estado === "bloqueado"
              ? estado.pasos[4].detalle
              : undefined
          }
          disponible={setup?.production.available ?? false}
          onActivado={() => setRevision((value) => value + 1)}
        />
      )}
      {started && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStarted(false);
            }}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Volver al resumen
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => navigate((step - 1) as FiscalStep)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Anterior
              </button>
            )}
            {step > 0 && step < 4 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => navigate((step + 1) as FiscalStep)}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm text-white"
              >
                Continuar: {fiscalSteps[step + 1]}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Último paso (SISTEMA-95): bloqueado hasta terminar los anteriores. Lo
 * técnico de la activación sigue en FiscalProductionSetup.
 */
export function PasoFacturacionReal({
  token,
  organizationId,
  bloqueo,
  disponible,
  onActivado,
}: {
  token: string;
  organizationId: string;
  onActivado?: () => void;
  /** Qué falta, si todavía está bloqueado. */
  bloqueo?: string;
  /** El servidor permite la facturación real. */
  disponible: boolean;
}) {
  if (bloqueo)
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="flex items-center gap-2 font-semibold text-slate-700">
          <Lock size={18} aria-hidden="true" />
          Facturación real
        </h3>
        <p className="mt-2 text-sm text-slate-600">{bloqueo}</p>
      </section>
    );
  return (
    <section className="rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold">Facturación real</h3>
      {!disponible && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <ShieldAlert size={18} className="shrink-0" aria-hidden="true" />
          Lo habilita el administrador del sistema. Podés preparar el
          certificado real mientras tanto.
        </p>
      )}
      <FiscalProductionSetup
        token={token}
        organizationId={organizationId}
        siempreAbierto
        disponible={disponible}
        onActivado={onActivado}
      />
    </section>
  );
}

export function InvoiceDesignPreview({
  profile,
  logo,
}: {
  profile: FiscalProfile;
  logo?: string;
}) {
  return (
    <aside className="rounded-xl bg-slate-100 p-4">
      <h3 className="mb-2 text-sm font-semibold">Diseño térmico · 80 mm</h3>
      <p className="mb-4 text-xs text-slate-500">
        Maqueta visual; no se envía a la impresora ni a ARCA.
      </p>
      <div className="tema-claro mx-auto max-w-[80mm] bg-white p-4 font-mono text-xs text-black shadow-sm">
        <p className="border-2 border-black p-2 text-center font-bold">
          MUESTRA · SIN VALIDEZ FISCAL
        </p>
        <img
          src={logoPreview(logo)}
          alt="Logo del emisor"
          className="mx-auto my-4 size-16 object-contain"
        />
        <h4 className="text-center text-lg font-bold break-words uppercase">
          {profile.legalName || "Razón social del emisor"}
        </h4>
        <p className="text-center break-words">
          CUIT: {formatearCuit(profile.cuit) || "Sin configurar"}
        </p>
        <p className="text-center break-words">
          {profile.address || "Domicilio fiscal"}
        </p>
        <p className="text-center">
          {[profile.city, profile.province].filter(Boolean).join(", ")}
        </p>
        <p className="text-center">
          {{
            REGISTERED: "Responsable inscripto",
            MONOTAX: "Monotributista",
            EXEMPT: "Exento",
          }[profile.vatCondition as "REGISTERED" | "MONOTAX" | "EXEMPT"] ||
            "Condición IVA pendiente"}
        </p>
        {profile.grossIncomeId && (
          <p className="text-center break-words">
            IIBB: {profile.grossIncomeId}
          </p>
        )}
        {profile.activityStart && (
          <p className="text-center">Inicio: {profile.activityStart}</p>
        )}
        <div className="my-3 border-y border-dashed border-black py-3 text-center">
          <strong className="text-xl">FACTURA</strong>
          <p>
            Tipo, punto de venta y número
            <br />
            pendientes de configuración
          </p>
        </div>
        <p>CLIENTE: Datos del receptor</p>
        <div className="my-3 border-y border-dashed border-black py-3">
          <div className="flex justify-between font-bold">
            <span>PRODUCTO</span>
            <span>IMPORTE</span>
          </div>
          <p className="mt-3">ARTÍCULO DE EJEMPLO</p>
          <p className="flex justify-between">
            <span>1 x $ 1.000,00</span>
            <span>$ 1.000,00</span>
          </p>
        </div>
        <p className="text-lg font-bold">TOTAL $ 1.000,00</p>
        <p className="mt-2">Impuestos: desglose pendiente</p>
        <div className="mt-4 border-t border-dashed border-black pt-3">
          <p>CAE: NO EMITIDO</p>
          <p>Vencimiento: NO EMITIDO</p>
          <p className="my-3 border border-dashed p-3 text-center">
            QR fiscal disponible únicamente
            <br />
            con autorización real
          </p>
          <p className="text-center font-bold">MUESTRA · NO ES UNA FACTURA</p>
        </div>
      </div>
    </aside>
  );
}
