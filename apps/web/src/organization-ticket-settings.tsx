import { useEffect, useId, useRef, useState } from "react";
import { Building2, Upload, Eye, Save, MapPin, BadgeCheck } from "lucide-react";
import { logoPreview, prepareTicketLogo } from "./lib/ticket-logo";
import {
  getTicketHeader,
  saveTicketHeader,
  type TicketHeaderSettings,
} from "./lib/api";

const fields: {
  key: Exclude<keyof TicketHeaderSettings, "logoRaster" | "printDensity">;
  label: string;
  max: number;
}[] = [
  {
    key: "name",
    label: "Nombre del comercio",
    max: 120,
  },
  {
    key: "address",
    label: "Dirección",
    max: 160,
  },
  { key: "city", label: "Ciudad", max: 100 },
  { key: "province", label: "Provincia", max: 100 },
  { key: "taxId", label: "CUIT", max: 32 },
  { key: "phone", label: "Teléfono", max: 40 },
];
export function OrganizationTicketSettings({
  token,
  organizationId,
  variant = "tickets",
  onSaved,
}: {
  token: string;
  organizationId: string;
  variant?: "general" | "tickets";
  onSaved?: (data: TicketHeaderSettings) => void;
}) {
  const [data, setData] = useState<TicketHeaderSettings>();
  const formId = useId();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void getTicketHeader(token, organizationId)
      .then((value) => {
        if (active && !dirty.current) setData(value);
      })
      .catch((cause) => {
        if (active)
          setMessage(
            cause instanceof Error ? cause.message : "No se pudo cargar.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId]);
  const save = async () => {
    if (!data || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveTicketHeader(token, organizationId, data);
      setData(saved);
      onSaved?.(saved);
      dirty.current = false;
      setMessage(
        "Datos guardados. El logo se actualizó en la cabecera y la pestaña; también se usará en los próximos tickets.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo guardar.",
      );
    } finally {
      setBusy(false);
      pending.current = false;
    }
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 xl:col-span-2">
      <header className="flex items-start gap-3 border-b border-slate-100 pb-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
          <Building2 size={21} />
        </span>
        <div>
          <h2 className="font-semibold text-slate-800">
            {variant === "general"
              ? "Datos de la organización"
              : "Encabezado de los tickets"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {variant === "general"
              ? "Identidad y datos de contacto. También se utilizan en los tickets de todas las sucursales."
              : "Logo y datos del encabezado de ventas y cobros. El formato de impresión se conserva."}
          </p>
        </div>
      </header>
      {data ? (
        <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_290px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="group relative mb-6 flex cursor-pointer flex-wrap items-center gap-4 rounded-xl border border-dashed border-teal-200 bg-teal-50/30 p-4 text-sm transition-colors hover:bg-teal-50 focus-within:ring-2 focus-within:ring-teal-600">
              <span className="grid size-16 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white p-2">
                <img
                  src={logoPreview(data.logoRaster)}
                  alt="Logo actual"
                  className="size-full object-contain"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-slate-700">
                  {variant === "general"
                    ? "Logo de la organización"
                    : "Logo del ticket"}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  PNG, JPG o WebP · Hasta 5 MB.
                  <br />
                  Se adapta a blanco y negro para el ticket.
                  <br />
                  Al guardar, también aparece en la cabecera y la pestaña.
                </span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-700">
                <Upload size={15} />
                Cambiar logo
              </span>
              <input
                aria-label={
                  variant === "general"
                    ? "Logo de la organización"
                    : "Logo del ticket"
                }
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
                  setMessage("");
                  void prepareTicketLogo(file)
                    .then((logoRaster) => {
                      dirty.current = true;
                      setData((current) =>
                        current ? { ...current, logoRaster } : current,
                      );
                    })
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
            {[
              {
                title: "Identidad del comercio",
                keys: ["name", "taxId"],
                icon: BadgeCheck,
              },
              {
                title: "Ubicación y contacto",
                keys: ["address", "city", "province", "phone"],
                icon: MapPin,
              },
            ].map((group) => (
              <fieldset key={group.title} className="mb-5 min-w-0">
                <legend className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-teal-800">
                  <group.icon size={15} />
                  {group.title}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {fields
                    .filter((field) => group.keys.includes(field.key))
                    .map((field) => (
                      <label
                        key={field.key}
                        className="text-xs font-medium text-slate-600"
                      >
                        {field.label}
                        <input
                          required={field.key === "name"}
                          minLength={field.key === "name" ? 2 : undefined}
                          maxLength={field.max}
                          disabled={busy}
                          value={data[field.key]}
                          onChange={(event) => {
                            dirty.current = true;
                            setData({
                              ...data,
                              [field.key]: event.target.value,
                            });
                            setMessage("");
                          }}
                          className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                        />
                      </label>
                    ))}
                </div>
              </fieldset>
            ))}
            <p className="mt-3 text-xs text-slate-500">
              Dirección, ciudad, provincia, CUIT y teléfono son opcionales. Los
              campos vacíos no se imprimen.
            </p>
            {variant === "tickets" && (
              <label className="mt-5 block rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                Densidad de impresión
                <select
                  value={data.printDensity ?? 4}
                  disabled={busy}
                  onChange={(event) => {
                    dirty.current = true;
                    setData({
                      ...data,
                      printDensity: Number(event.target.value),
                    });
                    setMessage("");
                  }}
                  className="mt-2 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 sm:max-w-xs"
                >
                  <option value={1}>1 · Menor intensidad</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4 · Predeterminada</option>
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                  <option value={7}>7</option>
                  <option value={8}>8 · Mayor intensidad</option>
                </select>
                <span className="mt-2 block text-xs text-slate-500">
                  Perfil Xprinter XP-80. Se aplica a los tickets de esta
                  organización; no cambia la vista previa. Otros modelos
                  requieren verificar compatibilidad.
                </span>
              </label>
            )}
          </form>
          <div className="space-y-4">
            <aside className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Eye size={17} className="text-teal-700" />
                Vista previa
              </p>
              <p className="mb-5 text-xs leading-5 text-slate-500">
                {variant === "general"
                  ? "Así se verán los datos de tu comercio en el encabezado."
                  : "Los cambios se muestran aquí antes de guardarlos."}
              </p>
              <div className="rounded-lg border border-slate-200 bg-white px-5 py-7 text-center text-black shadow-sm">
                <img
                  src={logoPreview(data.logoRaster)}
                  alt="Logo"
                  className="mx-auto mb-3 size-12 object-contain"
                />
                <h3 className="break-words text-xl font-extrabold uppercase">
                  {data.name || "Nombre del comercio"}
                </h3>
                <p className="mt-1 break-words text-sm">
                  {[
                    data.address.trim(),
                    [data.city.trim(), data.province.trim()]
                      .filter(Boolean)
                      .join(", "),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="break-words text-sm">
                  {[
                    data.taxId.trim() ? `CUIT ${data.taxId.trim()}` : "",
                    data.phone.trim() ? `Tel. ${data.phone.trim()}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="mt-4 text-center text-xs leading-5 text-slate-400">
                Vista orientativa · Los campos vacíos no se imprimen.
              </p>
            </aside>
            <button
              type="submit"
              form={formId}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save size={16} />
              {busy
                ? "Guardando…"
                : variant === "general"
                  ? "Guardar cambios"
                  : "Guardar configuración"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm">Cargando configuración…</p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-teal-800">
          {message}
        </p>
      )}
    </section>
  );
}
