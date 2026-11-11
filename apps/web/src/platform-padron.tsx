import { useCallback, useState } from "react";
import { Download, FileCheck2, KeyRound, Landmark, Upload } from "lucide-react";
import { PlatformPageHeader } from "./platform-ui";
import {
  getPlatformPadron,
  getPlatformPadronRequest,
  PlatformApiError,
  preparePlatformPadron,
  uploadPlatformPadron,
  type PadronAmbiente,
  type PlatformPadronStatus,
} from "./lib/platform-api";
import { usePlatformData } from "./lib/use-platform-data";

/** CUIT de Farmatec: consulta el padrón de ARCA para todas las farmacias. */
export const CUIT_FARMATEC = "20247237837";

const fecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
      })
    : "—";

/**
 * Certificado del padrón de ARCA de la plataforma (SISTEMA-70). Con él, la
 * búsqueda de CUIT anda en todas las farmacias sin que cada una configure
 * nada. Mismo circuito que el de facturación: solicitud, ARCA, certificado.
 */
export function PlatformPadron({
  token,
  onVerificationExpired,
}: {
  token: string;
  onVerificationExpired: () => void;
}) {
  const [ambiente, setAmbiente] = useState<PadronAmbiente>("HOMOLOGATION");
  const load = useCallback(
    () => getPlatformPadron(token, ambiente),
    [token, ambiente],
  );
  const { data, error, reload } = usePlatformData(load, onVerificationExpired);
  const [cuit, setCuit] = useState(CUIT_FARMATEC);
  const [certificado, setCertificado] = useState("");
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string }>();

  const hacer = async (
    tarea: () => Promise<PlatformPadronStatus | void>,
    exito: string,
  ) => {
    setBusy(true);
    setAviso(undefined);
    try {
      await tarea();
      setAviso({ ok: true, texto: exito });
      reload();
    } catch (cause) {
      if (
        cause instanceof PlatformApiError &&
        cause.code === "PLATFORM_VERIFICATION_REQUIRED"
      )
        return onVerificationExpired();
      setAviso({
        ok: false,
        texto: cause instanceof Error ? cause.message : "No se pudo completar.",
      });
    } finally {
      setBusy(false);
    }
  };

  const descargar = async () => {
    const solicitud = await getPlatformPadronRequest(token, ambiente);
    const url = URL.createObjectURL(
      new Blob([solicitud.csr], { type: "application/pkcs10" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = solicitud.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const homologacion = ambiente === "HOMOLOGATION";
  return (
    <section className="space-y-5">
      <PlatformPageHeader
        icon={<Landmark size={22} />}
        title="Certificado del padrón de ARCA"
        description="Con este certificado de Farmatec, el botón “Buscar en ARCA” de Clientes trae nombre, condición frente al IVA y domicilio de un CUIT en todas las farmacias, sin que cada una configure nada. Las facturas siguen saliendo con el certificado de cada farmacia."
        actions={
          <div
            role="tablist"
            aria-label="Ambiente de ARCA"
            className="inline-flex rounded-lg border border-slate-200 bg-white p-1"
          >
            {(
              [
                ["HOMOLOGATION", "Homologación"],
                ["PRODUCTION", "Producción"],
              ] as const
            ).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={ambiente === valor}
                onClick={() => {
                  setAmbiente(valor);
                  setAviso(undefined);
                  setCertificado("");
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${ambiente === valor ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {texto}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {aviso && (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`rounded-lg p-3 text-sm ${aviso.ok ? "bg-teal-50 text-teal-800" : "bg-rose-50 text-rose-800"}`}
        >
          {aviso.texto}
        </p>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-[#dce7ef] bg-white p-4 shadow-[0_3px_12px_rgb(25_56_74_/_3%)]">
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <KeyRound size={17} className="text-teal-700" />
              1. Generar la solicitud
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              La clave queda guardada cifrada en el servidor: nunca sale.
            </p>
            <label className="mt-3 block text-sm text-slate-500">
              CUIT de Farmatec
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                inputMode="numeric"
                maxLength={11}
                value={cuit}
                onChange={(e) => setCuit(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <button
              type="button"
              disabled={busy || cuit.length !== 11}
              onClick={() =>
                void hacer(async () => {
                  await preparePlatformPadron(token, {
                    environment: ambiente,
                    cuit,
                    expectedVersion: data.version,
                    replace: data.hasCertificate,
                  });
                  await descargar();
                }, "Solicitud generada y descargada. Subila a ARCA.")
              }
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <KeyRound size={16} />
              {data.hasCertificate
                ? "Generar otra solicitud"
                : "Generar solicitud"}
            </button>
            {data.hasRequest && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void hacer(descargar, "Solicitud descargada.")}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download size={16} />
                Descargar solicitud (.csr)
              </button>
            )}
          </article>

          <article className="rounded-xl border border-[#dce7ef] bg-white p-4 shadow-[0_3px_12px_rgb(25_56_74_/_3%)]">
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <Upload size={17} className="text-teal-700" />
              2. Subirla a ARCA
            </h3>
            {homologacion ? (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>
                  En WSASS (homologación), “Nuevo certificado”: pegá el
                  contenido del .csr y descargá el certificado.
                </li>
                <li>
                  “Crear autorización a servicio”: ese certificado, CUIT
                  representado {cuit || CUIT_FARMATEC}, servicio{" "}
                  <strong>ws_sr_constancia_inscripcion</strong>.
                </li>
              </ol>
            ) : (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>
                  En “Administración de certificados digitales”, agregá un alias
                  y subí el .csr. Descargá el certificado.
                </li>
                <li>
                  En el “Administrador de Relaciones”, nueva relación con el
                  servicio <strong>ws_sr_constancia_inscripcion</strong> para
                  ese certificado.
                </li>
              </ol>
            )}
          </article>

          <article className="rounded-xl border border-[#dce7ef] bg-white p-4 shadow-[0_3px_12px_rgb(25_56_74_/_3%)]">
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <FileCheck2 size={17} className="text-teal-700" />
              3. Cargar el certificado
            </h3>
            <input
              type="file"
              accept=".crt,.pem,.cer,.txt"
              aria-label="Archivo del certificado"
              disabled={busy || !data.hasRequest}
              className="mt-3 block w-full text-sm"
              onChange={(e) =>
                void e.target.files?.[0]?.text().then(setCertificado)
              }
            />
            <textarea
              aria-label="Certificado (también se puede pegar)"
              placeholder="-----BEGIN CERTIFICATE-----"
              disabled={busy || !data.hasRequest}
              value={certificado}
              onChange={(e) => setCertificado(e.target.value)}
              className="mt-2 h-24 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
            />
            <button
              type="button"
              disabled={busy || !data.hasRequest || !certificado.trim()}
              onClick={() =>
                void hacer(
                  () =>
                    uploadPlatformPadron(token, {
                      environment: ambiente,
                      certificate: certificado.trim(),
                      expectedVersion: data.version,
                    }).then(() => setCertificado("")),
                  "Certificado cargado. Probá “Buscar en ARCA” en Clientes.",
                )
              }
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <FileCheck2 size={16} />
              Cargar certificado
            </button>
          </article>
        </div>
      )}

      {data && (
        <dl className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Estado
            </dt>
            <dd className="mt-1 font-semibold text-slate-800">
              {data.hasCertificate
                ? "Certificado cargado"
                : data.hasRequest
                  ? "Esperando el certificado de ARCA"
                  : "Sin configurar"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              CUIT
            </dt>
            <dd className="mt-1 font-semibold text-slate-800">
              {data.cuit || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Vence
            </dt>
            <dd className="mt-1 font-semibold text-slate-800">
              {fecha(data.expiresAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Huella
            </dt>
            <dd className="mt-1 truncate font-mono text-xs text-slate-600">
              {data.fingerprint ?? "—"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
