import { BookOpen, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DatosFicha } from "./ficha-medicamento";
import {
  getFichaTerapeutica,
  linkBusquedaProspecto,
  resumenFicha,
  type ResumenFicha,
} from "./lib/ficha-terapeutica";

type Estado =
  | { tipo: "cargando" }
  | { tipo: "lista"; resumen: ResumenFicha | null }
  | { tipo: "error"; mensaje: string };

// La ficha no cambia durante la jornada: al volver a abrirla no se consulta.
const fichas = new Map<string, ResumenFicha | null>();

export type ProductoProspecto = {
  id: string;
  name: string;
  presentation?: string | null;
  concentration?: string | null;
  pharmaceuticalForm?: string | null;
  activeIngredient?: string | null;
  description?: string | null;
  laboratory?: { name: string } | null;
  barcodes: { code: string }[];
};

// Ventas (SISTEMA-108): pastilla chica junto al nombre que abre la ficha del
// medicamento (para qué sirve, cada cuánto se toma y la nota de la farmacia).
export function ProspectoPastilla({
  token,
  organizationId,
  producto,
}: {
  token: string;
  organizationId: string;
  producto: ProductoProspecto;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (abierto) dialogo.current?.showModal();
    else dialogo.current?.close();
  }, [abierto]);
  useEffect(() => {
    if (!abierto) return;
    if (fichas.has(producto.id)) {
      setEstado({ tipo: "lista", resumen: fichas.get(producto.id) ?? null });
      return;
    }
    const controller = new AbortController();
    setEstado({ tipo: "cargando" });
    getFichaTerapeutica(
      token,
      organizationId,
      {
        nombre: producto.name,
        codigos: producto.barcodes.map((barcode) => barcode.code),
        principioActivo: producto.activeIngredient ?? undefined,
        forma: producto.pharmaceuticalForm,
        presentacion: producto.presentation,
      },
      controller.signal,
    ).then(
      (respuesta) => {
        const resumen = resumenFicha(respuesta);
        fichas.set(producto.id, resumen);
        if (!controller.signal.aborted) setEstado({ tipo: "lista", resumen });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setEstado({
          tipo: "error",
          mensaje:
            error instanceof Error
              ? error.message
              : "No se pudo consultar la ficha.",
        });
      },
    );
    return () => controller.abort();
    // Se consulta al abrir; los datos del producto vienen con su id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, producto.id, token, organizationId]);
  const nota = producto.description?.trim();
  const detalle = [producto.presentation, producto.laboratory?.name]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <button
        type="button"
        title="Ver para qué sirve y cada cuánto se toma"
        onClick={() => setAbierto(true)}
        className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 align-middle text-[10px] font-medium leading-4 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
      >
        <BookOpen size={9} aria-hidden />
        Prospecto
      </button>
      <dialog
        ref={dialogo}
        aria-label={`Prospecto de ${producto.name}`}
        onCancel={(event) => {
          event.preventDefault();
          setAbierto(false);
        }}
        className="m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-velo/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex max-h-[88dvh] flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 pb-4 pt-5">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="mt-0.5 rounded-lg bg-teal-50 p-1.5 text-teal-700">
                <BookOpen size={16} aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-slate-800">
                  {producto.name}
                </h3>
                {detalle && (
                  <p className="truncate text-sm text-slate-500">{detalle}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setAbierto(false)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </header>
          <div className="space-y-3 overflow-y-auto px-6 py-4 text-sm">
            {estado.tipo === "cargando" && (
              <p className="text-slate-500">Buscando la ficha…</p>
            )}
            {estado.tipo === "error" && (
              <p className="text-red-700">{estado.mensaje}</p>
            )}
            {estado.tipo === "lista" && !estado.resumen && (
              <p className="text-slate-500">
                No se encontró la ficha de este producto. Podés buscar el
                prospecto completo.
              </p>
            )}
            {estado.tipo === "lista" && estado.resumen && (
              <div className="rounded-xl bg-slate-50 p-4">
                <DatosFicha
                  resumen={estado.resumen}
                  nombre={producto.name}
                  presentacion={producto.presentation}
                  concentracion={producto.concentration}
                />
              </div>
            )}
            {nota && (
              <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3">
                <p className="text-xs font-semibold text-teal-800">
                  Indicaciones de la farmacia
                </p>
                <p className="whitespace-pre-line text-slate-700">{nota}</p>
              </div>
            )}
          </div>
          <footer className="flex justify-end border-t border-slate-100 px-6 py-3">
            <a
              href={linkBusquedaProspecto(
                producto.name,
                producto.laboratory?.name,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              <ExternalLink size={14} aria-hidden />
              Buscar prospecto completo
            </a>
          </footer>
        </div>
      </dialog>
    </>
  );
}
