import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, FileCheck2, Save, ShieldAlert } from "lucide-react";
import {
  fiscalSettings,
  getTicketHeader,
  type FiscalProfile,
  type FiscalSetup,
} from "./lib/api";
import { logoPreview } from "./lib/ticket-logo";
import { FiscalChecklist, FiscalSetupPanel } from "./fiscal-setup";
import { FiscalArcaGuide, FiscalWizardSteps } from "./fiscal-wizard-guide";
import { resumeFiscalStep, type FiscalStep } from "./lib/fiscal-wizard";
import { FiscalProductionSetup } from "./fiscal-production-setup";

const field =
  "mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm";
const fields = [
  ["legalName", "Razón social", 160],
  ["cuit", "CUIT (11 dígitos)", 11],
  ["address", "Domicilio fiscal", 200],
  ["city", "Localidad", 100],
  ["province", "Provincia", 100],
  ["postalCode", "Código postal", 20],
  ["grossIncomeId", "Ingresos brutos / inscripción", 60],
  ["activityStart", "Inicio de actividades", 10],
] as const;

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
      <h2 className="flex items-center gap-2 font-semibold">
        <FileCheck2 size={20} className="text-teal-700" />
        Facturación electrónica
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Un asistente para preparar cada farmacia, sin volver a cargar los datos
        guardados.
      </p>
      <FiscalProductionSetup token={token} organizationId={organizationId} />
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert size={19} className="shrink-0" />
        <p>
          <strong>Modo homologación.</strong> Podés probar facturas C desde
          Ventas con stock y cobros de esta instalación, o emitir ejemplos sin
          movimientos desde Conexión ARCA. Ninguno tiene validez fiscal. La
          activación real se gestiona por separado en Facturación real ·
          Producción.
        </p>
      </div>
      {!started && (
        <div className="mt-5 rounded-xl border border-teal-100 bg-teal-50/50 p-5">
          <h3 className="font-semibold text-teal-900">
            Prepará la facturación paso a paso
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Te vamos a pedir los datos fiscales de esta organización y las
            sucursales. Después podés comprobar el certificado y emitir una
            prueba sin afectar stock ni caja. No necesitás compartir tu clave
            fiscal.
          </p>
          <button
            type="button"
            disabled={!profile}
            onClick={() => {
              setStep(
                dirty.current ? 0 : resumeFiscalStep(setup?.checks ?? []),
              );
              setStarted(true);
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm text-white disabled:opacity-50"
          >
            Configurar facturación <ArrowRight size={16} />
          </button>
          <p className="mt-3 text-xs text-slate-500">
            Sólo se conservan los datos que guardes. Producción permanece
            deshabilitada.
          </p>
          {dirty.current && (
            <p className="mt-3 text-sm text-amber-800">
              Tenés datos sin guardar. Al continuar volverás al primer paso.
            </p>
          )}
          {setup && <FiscalChecklist checks={setup.checks} />}
        </div>
      )}
      {started && (
        <FiscalWizardSteps step={step} onChange={navigate} disabled={busy} />
      )}
      <div hidden={!started || step !== 0}>
        <h3 className="mt-5 font-semibold">Datos fiscales de tu farmacia</h3>
        <p className="mt-1 text-xs text-slate-500">
          Usá la razón social y domicilio fiscal del emisor. No se fija un
          régimen por defecto para otras farmacias.
        </p>
        {profile && (
          <div className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (pending.current) return;
                const continueAfterSave =
                  (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
                    "value",
                  ) === "continue";
                pending.current = true;
                setBusy(true);
                setMessage("");
                void fiscalSettings(token, organizationId, profile)
                  .then((result) => {
                    setProfile(result.profile);
                    dirty.current = false;
                    setRevision((value) => value + 1);
                    setMessage(
                      "Borrador fiscal guardado. La emisión sigue deshabilitada.",
                    );
                    if (continueAfterSave) setStep(1);
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
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map(([key, label, max]) => (
                  <label
                    key={key}
                    className="text-xs font-medium text-slate-600"
                  >
                    {label}
                    <input
                      disabled={busy}
                      className={field}
                      maxLength={max}
                      type={key === "activityStart" ? "date" : "text"}
                      inputMode={key === "cuit" ? "numeric" : undefined}
                      value={profile[key]}
                      onChange={(event) => {
                        dirty.current = true;
                        setProfile({
                          ...profile,
                          [key]:
                            key === "cuit"
                              ? event.target.value.replace(/\D/g, "")
                              : event.target.value,
                        });
                        setMessage("");
                      }}
                    />
                  </label>
                ))}
                <label className="text-xs font-medium text-slate-600">
                  Condición frente al IVA
                  <select
                    className={field}
                    disabled={busy}
                    value={profile.vatCondition}
                    onChange={(event) => {
                      dirty.current = true;
                      setProfile({
                        ...profile,
                        vatCondition: event.target.value,
                      });
                      setMessage("");
                    }}
                  >
                    <option value="">Sin definir</option>
                    <option value="REGISTERED">Responsable inscripto</option>
                    <option value="MONOTAX">Monotributista</option>
                    <option value="EXEMPT">Exento</option>
                  </select>
                </label>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Podés guardar un borrador incompleto. Los datos y el régimen
                aplicable deben validarse antes de emitir.
              </p>
              <button
                type="submit"
                disabled={busy}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm text-white disabled:opacity-50"
              >
                <Save size={16} />
                {busy ? "Guardando…" : "Guardar datos fiscales"}
              </button>
              <button
                type="submit"
                value="continue"
                disabled={busy}
                className="mt-5 ml-3 inline-flex items-center gap-2 rounded-lg border border-teal-200 px-4 py-2.5 text-sm text-teal-800 disabled:opacity-50"
              >
                Guardar y continuar <ArrowRight size={16} />
              </button>
            </form>
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
      {started && step === 3 && (
        <section className="rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold">Revisión de la preparación</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Este estado corresponde a lo guardado en el sistema, no a una
            autorización de ARCA.
          </p>
          {setup ? (
            <FiscalChecklist checks={setup.checks} />
          ) : (
            <p className="mt-3 text-sm">Cargando estado guardado…</p>
          )}
          <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Para probar el circuito completo, elegí Factura · prueba en Ventas.
            Descuenta stock y registra cobros. Los ejemplos sin movimientos
            siguen en Conexión ARCA. La producción se activa por separado para
            cada sucursal.
          </p>
        </section>
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
            {(step === 1 || step === 2) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => navigate((step + 1) as FiscalStep)}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm text-white"
              >
                {step === 1 ? "Continuar a sucursales" : "Revisar preparación"}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}
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
      <div className="mx-auto max-w-[80mm] bg-white p-4 font-mono text-xs text-black shadow-sm">
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
          CUIT: {profile.cuit || "Sin configurar"}
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
