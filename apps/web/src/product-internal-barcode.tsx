import { useEffect, useRef, useState } from "react";
import { Barcode, Printer, X } from "lucide-react";
import { productInternalBarcode } from "./lib/api";
import { barcodeLabelsHtml, internalBarcodeSvg } from "./lib/barcode-labels";
import { printTicketFrame } from "./lib/browser-ticket-print";

export function ProductInternalBarcode({
  token,
  organizationId,
  productId,
  draftName,
  draftSaleUnit,
  pending,
  onPendingChange,
}: {
  token: string;
  organizationId: string;
  productId?: string;
  draftName: string;
  draftSaleUnit: "BOX" | "BLISTER" | "UNIT";
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] =
    useState<Awaited<ReturnType<typeof productInternalBarcode>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copies, setCopies] = useState(21);
  const [loaded, setLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const element = dialog.current;
    if (open) element?.showModal();
    return () => element?.close();
  }, [open]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function load() {
    if (!productId) {
      setData({ name: draftName, saleUnit: draftSaleUnit, code: null });
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const current = generation.current;
    try {
      const result = await productInternalBarcode(
        token,
        organizationId,
        productId,
      );
      if (current !== generation.current) return;
      setData(result);
      setLoaded(false);
    } catch (error) {
      if (current === generation.current)
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo obtener el código.",
        );
    } finally {
      lock.current = false;
      if (current === generation.current) setBusy(false);
    }
  }
  const unit =
    data?.saleUnit === "BLISTER"
      ? "Blíster"
      : data?.saleUnit === "BOX"
        ? "Caja"
        : "Unidad";
  const validCopies = Number.isInteger(copies) && copies >= 1 && copies <= 210;
  const html =
    data?.code && validCopies
      ? barcodeLabelsHtml(data.name, unit, data.code, copies)
      : "";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setData(undefined);
          setLoaded(false);
          void load();
        }}
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-teal-700 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
      >
        <Barcode size={17} />
        Código interno
      </button>
      <dialog
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) setOpen(false);
        }}
        aria-labelledby="barcode-title"
        style={{ width: "min(560px, calc(100vw - 32px))" }}
        tabIndex={-1}
        className="m-auto max-h-[90dvh] overflow-y-auto rounded-2xl border-0 bg-white p-6 shadow-xl outline-none backdrop:bg-slate-950/40"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="barcode-title" className="text-lg font-semibold">
              Código interno y etiquetas
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {(data?.code ? data.name : draftName) || "Nuevo producto"} ·{" "}
              {data?.code ? "Datos guardados" : "Borrador"}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Cerrar etiquetas"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </header>
        <p className="my-4 text-sm leading-relaxed text-slate-500">
          Un código propio para escanear este producto, sin reemplazar el
          original ni cambiar precios o stock.
        </p>
        {error && (
          <p
            role="alert"
            className="my-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
          >
            {error}
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="ml-2 underline"
            >
              Reintentar consulta
            </button>
          </p>
        )}
        {busy && (
          <p role="status" className="text-sm">
            Preparando código…
          </p>
        )}
        {data && !data.code && (
          <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/50 p-5 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-teal-700">
              <Barcode size={28} aria-hidden="true" />
            </span>
            <p className="mb-1 font-medium text-slate-800">
              {pending
                ? "Código interno pendiente de guardar"
                : "Todavía no tiene código interno"}
            </p>
            <p className="mb-4 text-sm text-slate-500">
              {pending
                ? "Guardá el producto para confirmar el código y poder imprimir sus etiquetas."
                : "Se creará junto con el producto cuando guardes los cambios."}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPendingChange(!pending)}
              className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-40"
            >
              {pending ? "Descartar generación" : "Generar código interno"}
            </button>
          </div>
        )}
        {data?.code && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Vista previa de una etiqueta
              </p>
              <div className="mx-auto max-w-72 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center">
                <p className="text-sm font-semibold text-slate-800">
                  {data.name}
                </p>
                <p className="mb-2 text-xs text-slate-500">
                  {unit} · Código interno
                </p>
                <img
                  alt={`Código de barras ${data.code}`}
                  src={`data:image/svg+xml,${encodeURIComponent(internalBarcodeSvg(data.code))}`}
                  className="mx-auto h-14 w-full"
                />
                <p className="mt-2 font-mono text-sm">{data.code}</p>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Cantidad de etiquetas
                <input
                  type="number"
                  min={1}
                  max={210}
                  step={1}
                  value={copies}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  onChange={(event) => {
                    setCopies(Number(event.target.value));
                    setLoaded(false);
                  }}
                  className="mt-1 block h-10 w-24 rounded-lg border px-3"
                />
              </label>
              <div className="text-xs">
                <p className="text-slate-500">
                  A4 · 21 por hoja · 62 × 36 mm · {unit}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || !loaded || !html}
                onClick={() => {
                  if (frame.current)
                    void printTicketFrame(frame.current).catch((error) =>
                      setError(
                        error instanceof Error
                          ? error.message
                          : "No se pudo imprimir.",
                      ),
                    );
                }}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-40"
              >
                <Printer size={17} />
                Imprimir
              </button>
            </div>
            {!validCopies && (
              <p role="alert" className="text-sm text-rose-700">
                Elegí de 1 a 210 etiquetas.
              </p>
            )}
            <p className="mb-3 text-xs text-slate-500">
              Papel A4 común para recortar. Imprimí al 100%, sin ajustar a
              página ni encabezados. Probá una etiqueta antes de imprimir
              muchas.
            </p>
            {html && (
              <iframe
                ref={frame}
                title="Documento de impresión de etiquetas A4"
                aria-hidden="true"
                tabIndex={-1}
                srcDoc={html}
                onLoad={() => setLoaded(true)}
                className="pointer-events-none fixed h-px w-px opacity-0"
              />
            )}
          </>
        )}
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
          {data?.code
            ? "Se usan los datos guardados. Si cambiaste el nombre o la unidad, guardá el producto antes de imprimir."
            : "Cerrar esta ventana conserva la selección en el formulario. Cancelar el producto descarta la generación."}
        </p>
      </dialog>
    </>
  );
}
