import { useEffect, useRef, useState } from "react";
import { Download, FileKey2, Upload, CheckCircle2 } from "lucide-react";
import {
  fiscalCredentials,
  getFiscalRequest,
  type FiscalCredentialStatus,
} from "./lib/api";
import { readFiscalFile } from "./lib/fiscal-file";

const control =
  "mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm";
export function FiscalCertificateSetup({
  token,
  organizationId,
  environment = "HOMOLOGATION",
}: {
  token: string;
  organizationId: string;
  environment?: "HOMOLOGATION" | "PRODUCTION";
}) {
  const [status, setStatus] = useState<FiscalCredentialStatus>();
  const [holderCuit, setHolderCuit] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [certificate, setCertificate] = useState<File>();
  const [key, setKey] = useState<File>();
  const [passphrase, setPassphrase] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [csr, setCsr] = useState("");
  const pending = useRef(false);
  const certInput = useRef<HTMLInputElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    void fiscalCredentials(
      token,
      organizationId,
      undefined,
      undefined,
      environment,
    )
      .then((value) => {
        if (active) {
          setStatus(value);
          setHolderCuit(
            (current) => current || value.holderCuit || value.representedCuit,
          );
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
  }, [token, organizationId, revision, environment]);
  async function perform(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar. Tus archivos anteriores se conservan.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      setPassphrase("");
    }
  }
  async function download() {
    const request = await getFiscalRequest(token, organizationId, environment);
    setCsr(request.csr);
    const url = URL.createObjectURL(
      new Blob([request.csr], { type: "application/pkcs10" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = request.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const allowed = status && status.storage !== "UNAVAILABLE";
  const needKey = mode === "existing" || !status?.hasRequest;
  return (
    <section className="mt-5 rounded-xl border border-teal-200 bg-white p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <FileKey2 size={20} className="text-teal-700" />
        {environment === "PRODUCTION"
          ? "Preparar el certificado de producción"
          : "Preparar el certificado de prueba"}
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        Elegí tu situación. El sistema prepara los archivos técnicos; vos
        completás la autorización en el portal oficial de ARCA.
      </p>
      {!status && !message && (
        <p className="mt-3 text-sm">Cargando configuración segura…</p>
      )}
      {!status && message && (
        <button
          type="button"
          onClick={() => {
            setMessage("");
            setRevision((value) => value + 1);
          }}
          className="mt-3 rounded-lg border px-3 py-2 text-sm"
        >
          Reintentar carga
        </button>
      )}
      {status && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                setStatus(
                  await fiscalCredentials(
                    token,
                    organizationId,
                    undefined,
                    undefined,
                    environment,
                  ),
                );
                setMessage("Estado actualizado.");
              })
            }
            className="mt-3 text-sm text-teal-700 underline disabled:opacity-50"
          >
            Actualizar estado de los archivos
          </button>
          {status.storage === "UNAVAILABLE" && (
            <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm">
              {environment === "PRODUCTION"
                ? "Este servidor no tiene disponible el custodio de producción. Si abriste localhost, entrá a la web publicada después de actualizar Oracle. La solicitud y su clave deben quedar en el servidor que facturará, no en cada PC."
                : "El servidor todavía no tiene habilitado el almacenamiento cifrado. Por seguridad no permite generar ni recibir claves. Necesita configuración del administrador, no tu clave fiscal."}
            </p>
          )}
          {status.storage === "WINDOWS_DPAPI" && (
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Pruebas locales: la clave queda cifrada para este usuario de
              Windows. No se puede trasladar copiando sólo la base de datos;
              configurá el servidor definitivo antes de usar credenciales de
              producción.
            </p>
          )}
          {!status.profileMatches && (
            <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
              Cambió el CUIT de la farmacia. Revisá los datos antes de
              reemplazar la configuración.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["new", "No tengo certificado"],
                ["existing", "Ya tengo certificado y clave"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                disabled={busy}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setPassphrase("");
                  setReplace(false);
                }}
                className={`rounded-xl border p-4 text-left text-sm ${mode === value ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="mt-4 block max-w-md text-sm">
            {environment === "PRODUCTION"
              ? "CUIT del titular del certificado de producción"
              : "CUIT de la persona que ingresa a WSASS"}
            <input
              disabled={busy}
              value={holderCuit}
              onChange={(event) =>
                setHolderCuit(
                  event.target.value.replace(/\D/g, "").slice(0, 11),
                )
              }
              inputMode="numeric"
              maxLength={11}
              placeholder="11 dígitos, sin guiones"
              className={control}
            />
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Es el titular del certificado. Puede ser distinto del CUIT de la
            farmacia ({status.representedCuit || "completalo en Tus datos"});
            luego debe autorizarse la representación en ARCA.
          </p>
          {status.version > 0 && (
            <label className="mt-4 flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                disabled={busy}
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
              />
              Confirmo reemplazar los archivos anteriores si genero una nueva
              solicitud o cargo otro par. Esto no revoca certificados en ARCA.
            </label>
          )}
          {mode === "new" && (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-slate-50 p-4">
                <h4 className="text-sm font-semibold">
                  1. Prepará la solicitud acá
                </h4>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Usamos la razón social guardada y el CUIT del titular. Se
                  genera la clave técnica y se protege en el servidor; no tenés
                  que escribir comandos.
                </p>
                <button
                  type="button"
                  disabled={!allowed || busy || holderCuit.length !== 11}
                  onClick={() =>
                    void perform(async () => {
                      const next = await fiscalCredentials(
                        token,
                        organizationId,
                        "request",
                        {
                          holderCuit,
                          expectedVersion: status.version,
                          replace,
                        },
                        environment,
                      );
                      setStatus(next);
                      setReplace(false);
                      await download();
                      setMessage(
                        "Solicitud preparada. Seguí el paso 2 para obtener el certificado de ARCA.",
                      );
                    })
                  }
                  className="mt-3 rounded-lg bg-teal-700 px-4 py-2.5 text-sm text-white disabled:opacity-50"
                >
                  {busy
                    ? "Procesando…"
                    : status.hasRequest && !replace
                      ? "Descargar mi solicitud"
                      : "Preparar y descargar solicitud"}
                </button>
              </div>
              {status.hasRequest && (
                <CertificateInstructions
                  holderCuit={status.holderCuit}
                  representedCuit={status.representedCuit}
                  environment={environment}
                />
              )}
              {csr && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-teal-800">
                    Ver solicitud para copiar en ARCA
                  </summary>
                  <textarea
                    readOnly
                    aria-label="Solicitud pública de certificado"
                    value={csr}
                    className="mt-2 h-40 w-full rounded-lg border p-3 font-mono text-xs"
                  />
                  <p className="text-xs text-slate-500">
                    Copiá todo, incluidas las líneas BEGIN y END. Esto no es la
                    clave privada.
                  </p>
                </details>
              )}
            </div>
          )}
          {(mode === "existing" || status.hasRequest) && (
            <form
              className="mt-5 rounded-lg border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  if (!window.isSecureContext)
                    throw new Error(
                      "Para cargar archivos necesitás HTTPS o la app local en localhost.",
                    );
                  const certificateText = await readFiscalFile(
                    certificate,
                    "certificate",
                  );
                  const privateKey = needKey
                    ? await readFiscalFile(key, "privateKey")
                    : undefined;
                  const next = await fiscalCredentials(
                    token,
                    organizationId,
                    "certificate",
                    {
                      holderCuit,
                      expectedVersion: status.version,
                      replace,
                      certificate: certificateText,
                      ...(privateKey
                        ? { privateKey, passphrase: passphrase || undefined }
                        : {}),
                    },
                    environment,
                  );
                  setStatus(next);
                  setCertificate(undefined);
                  setKey(undefined);
                  setReplace(false);
                  if (certInput.current) certInput.current.value = "";
                  if (keyInput.current) keyInput.current.value = "";
                  setMessage(
                    "Archivos guardados y comprobados localmente. Todavía falta verificar autorización con ARCA; esto no habilita facturas.",
                  );
                });
              }}
            >
              <h4 className="text-sm font-semibold">
                {mode === "new"
                  ? "3. Cargá el certificado que te dio ARCA"
                  : "Cargá tus archivos del mismo trámite"}
              </h4>
              <label className="mt-3 block text-sm">
                Certificado (.crt, .cer o .pem en formato PEM)
                <input
                  ref={certInput}
                  type="file"
                  accept=".crt,.cer,.pem"
                  required
                  disabled={!allowed || busy}
                  onChange={(event) => setCertificate(event.target.files?.[0])}
                  className={control}
                />
              </label>
              {needKey ? (
                <>
                  <label className="mt-3 block text-sm">
                    Clave privada (.key o .pem)
                    <input
                      ref={keyInput}
                      type="file"
                      accept=".key,.pem"
                      required
                      disabled={!allowed || busy}
                      onChange={(event) => setKey(event.target.files?.[0])}
                      className={control}
                    />
                  </label>
                  <label className="mt-3 block text-sm">
                    Contraseña del archivo, sólo si tiene una
                    <input
                      type="password"
                      autoComplete="off"
                      value={passphrase}
                      disabled={busy}
                      onChange={(event) => setPassphrase(event.target.value)}
                      className={control}
                    />
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    No es tu clave fiscal. No se guarda esta contraseña.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Ya tenemos protegida la clave de la solicitud. No hace falta
                  cargarla otra vez.
                </p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                No se aceptan fotos, PDF ni PFX. Los archivos se comprueban
                antes de reemplazar lo guardado.
              </p>
              <button
                disabled={!allowed || busy || holderCuit.length !== 11}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm text-white disabled:opacity-50"
              >
                <Upload size={16} />
                Validar y guardar archivos
              </button>
            </form>
          )}
          {status.hasCertificate && (
            <div className="mt-4 rounded-lg bg-teal-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 size={17} />
                {status.expiresAt && Date.parse(status.expiresAt) <= Date.now()
                  ? "Certificado vencido · cargá uno vigente"
                  : "Archivos cargados · comprobación local"}
              </p>
              <p className="mt-2 text-xs">
                Vence:{" "}
                {status.expiresAt
                  ? new Date(status.expiresAt).toLocaleDateString("es-AR")
                  : "Sin dato"}
                .{" "}
                {environment === "PRODUCTION"
                  ? "Usá Verificar producción para consultar ARCA sin emitir facturas."
                  : "Usá Probar conexión con ARCA en el bloque superior para verificar la autorización."}
              </p>
            </div>
          )}
          {status.hasRequest && mode === "existing" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void perform(download)}
              className="mt-3 inline-flex items-center gap-2 text-sm text-teal-700"
            >
              <Download size={16} />
              Descargar solicitud existente
            </button>
          )}
        </>
      )}
      {message && (
        <p role="status" className="mt-4 rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}

export function CertificateInstructions({
  holderCuit,
  representedCuit,
  environment = "HOMOLOGATION",
}: {
  holderCuit: string;
  representedCuit: string;
  environment?: "HOMOLOGATION" | "PRODUCTION";
}) {
  if (environment === "PRODUCTION")
    return (
      <ProductionCertificateInstructions
        holderCuit={holderCuit}
        representedCuit={representedCuit}
      />
    );
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <h4 className="text-sm font-semibold">
        2. Obtené el certificado en ARCA
      </h4>
      <ol className="mt-2 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-600">
        <li>
          Ingresá vos al portal oficial con el CUIT del titular:{" "}
          <strong>{holderCuit}</strong>. Tu clave fiscal se usa sólo allí.
        </li>
        <li>
          Si no aparece WSASS, adherilo desde el Administrador de Relaciones
          siguiendo la guía oficial.
        </li>
        <li>
          En WSASS elegí «Nuevo Certificado». Indicá un alias que no hayas
          usado, por ejemplo <strong>gestion-pruebas</strong>, y pegá el
          contenido de la solicitud que descargaste.
        </li>
        <li>
          Al crear el certificado, guardá el texto completo que devuelve ARCA
          como <strong>certificado.pem</strong>. Volvé y cargalo abajo.
        </li>
        <li>
          En «Crear Autorización a Servicio», elegí ese alias, el CUIT
          representado <strong>{representedCuit}</strong> y el servicio
          correspondiente a WSFE. La autorización no se obtiene solamente
          descargando el certificado.
        </li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-teal-700">
        <a
          href="https://auth.afip.gov.ar/contribuyente_/login.xhtml"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Ingresar a ARCA
        </a>
        <a
          href="https://www.arca.gob.ar/ws/documentacion/certificados.asp"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Cómo habilitar WSASS
        </a>
        <a
          href="https://www.arca.gob.ar/ws/WSASS/html/crearcertificado.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Guía oficial del certificado
        </a>
      </div>
    </div>
  );
}
export function ProductionCertificateInstructions({
  holderCuit,
  representedCuit,
}: {
  holderCuit: string;
  representedCuit: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <h4 className="text-sm font-semibold">
        2. Obtené el certificado de producción en ARCA
      </h4>
      <ol className="mt-2 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-600">
        <li>
          Ingresá al portal oficial con el titular {holderCuit}. Tu clave fiscal
          se usa únicamente allí.
        </li>
        <li>
          Abrí Administración de Certificados Digitales. Si no aparece,
          habilitalo desde el Administrador de Relaciones.
        </li>
        <li>
          Elegí el contribuyente, agregá un alias nuevo (por ejemplo
          gestion-produccion) y subí la solicitud .csr que descargaste de esta
          pantalla.
        </li>
        <li>
          Entrá en Ver junto al alias y descargá el certificado. Volvé y cargalo
          abajo; la clave técnica permanece protegida en el servidor.
        </li>
        <li>
          En el Administrador de Relaciones, asociá el certificado al servicio
          WSFE para el CUIT representado {representedCuit}. Descargar el
          certificado no completa esta autorización.
        </li>
        <li>
          En Administración de puntos de venta y domicilios, verificá un punto
          específico para Factura Electrónica por Web Services. No copies el
          punto de homologación.
        </li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-teal-700">
        <a
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
          href="https://auth.afip.gov.ar/contribuyente_/login.xhtml"
        >
          Ingresar a ARCA
        </a>
        <a
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
          href="https://www.arca.gob.ar/ws/WSAA/wsaa_obtener_certificado_produccion.pdf"
        >
          Guía del certificado
        </a>
        <a
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
          href="https://www.arca.gob.ar/ws/WSAA/wsaa_asociar_certificado_a_wsn_produccion.pdf"
        >
          Guía de autorización
        </a>
      </div>
    </div>
  );
}
