import { useEffect, useId, useRef, useState } from "react";
import type { ThermalTicket } from "@gestion/contracts";
import {
  Eye,
  FileText,
  ImageOff,
  Maximize2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { A4PreviewDialog } from "./a4-preview-dialog";
import { a4DocumentHtml } from "./lib/a4-document";
import { getTicketHeader } from "./lib/api";
import {
  getDocumentTemplate,
  saveDocumentLogo,
  saveDocumentTemplate,
} from "./lib/document-template-api";
import { prepareProductImage } from "./lib/prepare-product-image";

const ACCENTS = [
  "#087f70",
  "#0369a1",
  "#4f46e5",
  "#be123c",
  "#b45309",
  "#334155",
];
const FOOTER_MAX = 600;
// Hoja A4 a 96 dpi, mostrada a escala dentro de la vista previa.
const PAGE = { width: 794, height: 1123, scale: 0.6 };

type Draft = {
  accentColor: string;
  footerText: string;
  logo: string | null;
  logoChanged: boolean;
};

function sampleTicket(store: ThermalTicket["store"]): ThermalTicket {
  return {
    kind: "sale",
    id: "muestra",
    number: "MUESTRA",
    date: new Date().toISOString(),
    store,
    branch: "Casa Central",
    cashier: "Vendedor",
    customer: "Consumidor final",
    items: [
      {
        name: "Producto de ejemplo 500 mg x 20 comp.",
        quantity: 2,
        unitPriceMinor: "450000",
        amountMinor: "900000",
      },
      {
        name: "Crema hidratante 200 ml",
        quantity: 1,
        unitPriceMinor: "690000",
        amountMinor: "690000",
      },
    ],
    subtotalMinor: "1590000",
    discountMinor: "90000",
    totalMinor: "1500000",
    payments: [{ method: "CASH", amountMinor: "1500000" }],
  };
}

export function OrganizationDocumentTemplate({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<Draft>();
  const [store, setStore] = useState<ThermalTicket["store"]>({ name: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  const pending = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      getDocumentTemplate(token, organizationId),
      getTicketHeader(token, organizationId),
    ])
      .then(([template, header]) => {
        if (!active) return;
        // El A4 toma nombre y datos del encabezado del ticket.
        setStore({
          name: header.name,
          address: [
            header.address,
            [header.city, header.province].filter(Boolean).join(", "),
          ]
            .filter(Boolean)
            .join(" · "),
          contact: [
            header.taxId ? `CUIT ${header.taxId}` : "",
            header.phone ? `Tel. ${header.phone}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        });
        if (!dirty.current)
          setDraft({
            accentColor: template.accentColor,
            footerText: template.footerText,
            logo: template.logo,
            logoChanged: false,
          });
      })
      .catch((cause: unknown) => {
        if (active)
          setMessage(
            cause instanceof Error ? cause.message : "No se pudo cargar.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId]);
  const change = (next: Partial<Draft>) => {
    dirty.current = true;
    setMessage("");
    setDraft((current) => (current ? { ...current, ...next } : current));
  };
  const save = async () => {
    if (!draft || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (draft.logoChanged)
        await saveDocumentLogo(token, organizationId, draft.logo);
      const saved = await saveDocumentTemplate(token, organizationId, {
        accentColor: draft.accentColor,
        footerText: draft.footerText,
      });
      setDraft({ ...draft, ...saved, logoChanged: false });
      dirty.current = false;
      setMessage("Plantilla A4 guardada. Se usa en los próximos comprobantes.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo guardar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <header className="flex items-start gap-3 border-b border-slate-100 pb-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
          <FileText size={21} />
        </span>
        <div>
          <h2 className="font-semibold text-slate-800">Comprobante A4</h2>
          <p className="mt-1 text-sm text-slate-500">
            Plantilla de hoja A4 para facturas y comprobantes internos. Usa los
            datos del encabezado de arriba; el ticket térmico no cambia.
          </p>
        </div>
      </header>
      {draft ? (
        <div className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
          <form
            id={formId}
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-teal-200 bg-teal-50/30 p-4 text-sm">
              <span className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                {draft.logo ? (
                  <img
                    src={draft.logo}
                    alt="Logo del comprobante A4"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <ImageOff size={22} className="text-slate-300" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-slate-700">
                  Logo a color
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  PNG, JPG o WebP · Se optimiza para la hoja. Sin logo se
                  muestra solo el nombre del comercio.
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-700 focus-within:ring-2 focus-within:ring-teal-600">
                  <Upload size={15} />
                  {draft.logo ? "Cambiar logo" : "Subir logo"}
                  <input
                    aria-label="Logo a color del comprobante A4"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file || pending.current) return;
                      pending.current = true;
                      setBusy(true);
                      void prepareProductImage(file)
                        .then((logo) => change({ logo, logoChanged: true }))
                        .catch((cause: unknown) =>
                          setMessage(
                            cause instanceof Error
                              ? cause.message
                              : "No se pudo leer la imagen.",
                          ),
                        )
                        .finally(() => {
                          pending.current = false;
                          setBusy(false);
                        });
                    }}
                  />
                </label>
                {draft.logo && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => change({ logo: null, logoChanged: true })}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-rose-200 hover:text-rose-700"
                  >
                    <Trash2 size={15} /> Quitar
                  </button>
                )}
              </span>
            </div>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold tracking-wide text-teal-800">
                Color de acento
              </legend>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Usar color ${color}`}
                    aria-pressed={draft.accentColor === color}
                    disabled={busy}
                    onClick={() => change({ accentColor: color })}
                    style={{ backgroundColor: color }}
                    className={`size-8 rounded-full border-2 ${draft.accentColor === color ? "border-slate-900 ring-2 ring-white ring-offset-1" : "border-white shadow-sm"}`}
                  />
                ))}
                <label className="ml-2 inline-flex items-center gap-2 text-xs text-slate-600">
                  Otro
                  <input
                    type="color"
                    aria-label="Elegir otro color de acento"
                    disabled={busy}
                    value={draft.accentColor}
                    onChange={(event) =>
                      change({ accentColor: event.target.value.toLowerCase() })
                    }
                    className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white"
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Se usa en la línea superior, los títulos de la tabla y el total.
              </p>
            </fieldset>
            <label className="block text-xs font-semibold tracking-wide text-teal-800">
              Pie de página
              <textarea
                rows={4}
                maxLength={FOOTER_MAX}
                disabled={busy}
                value={draft.footerText}
                placeholder="Ej.: Gracias por tu compra · Atención de lunes a sábado de 8 a 21 · WhatsApp …"
                onChange={(event) => change({ footerText: event.target.value })}
                className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal tracking-normal text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
              <span className="mt-1 block text-right font-normal tracking-normal text-slate-400">
                {draft.footerText.length} / {FOOTER_MAX}
              </span>
            </label>
          </form>
          <div className="space-y-4">
            <aside className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Eye size={17} className="text-teal-700" />
                Vista previa A4
              </p>
              <p className="mb-4 text-xs leading-5 text-slate-500">
                Comprobante de ejemplo con tus datos. Los cambios se ven antes
                de guardar.
              </p>
              <div
                className="mx-auto overflow-hidden rounded border border-slate-200 bg-white shadow-sm"
                style={{
                  width: PAGE.width * PAGE.scale,
                  height: PAGE.height * PAGE.scale,
                }}
              >
                <iframe
                  title="Vista previa del comprobante A4"
                  sandbox=""
                  srcDoc={a4DocumentHtml(sampleTicket(store), draft)}
                  style={{
                    width: PAGE.width,
                    height: PAGE.height,
                    transform: `scale(${PAGE.scale})`,
                    transformOrigin: "top left",
                  }}
                  className="border-0"
                />
              </div>
              <button
                type="button"
                onClick={() => setFullPreview(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#0f9b8e] bg-white px-4 py-2 text-sm font-semibold text-[#087f70] hover:bg-teal-50"
              >
                <Maximize2 size={15} /> Ver en tamaño real · PDF
              </button>
            </aside>
            {fullPreview && (
              <A4PreviewDialog
                title="Comprobante A4 de ejemplo"
                html={a4DocumentHtml(sampleTicket(store), draft)}
                onClose={() => setFullPreview(false)}
              />
            )}
            <button
              type="submit"
              form={formId}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save size={16} />
              {busy ? "Guardando…" : "Guardar plantilla A4"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm">Cargando plantilla…</p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-teal-800">
          {message}
        </p>
      )}
    </section>
  );
}
