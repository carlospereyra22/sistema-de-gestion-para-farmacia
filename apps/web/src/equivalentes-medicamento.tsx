import { ArrowLeftRight, Layers, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEquivalentes, type EstadoEquivalentes } from "./use-equivalentes";
import {
  diferenciaPorUnidad,
  mejorPorUnidad,
  precioAlternativa,
  precioPorUnidad,
  type Alternativa,
  type ConsultaEquivalentes,
  type Equivalentes,
} from "./lib/equivalentes";

const money = (minor: string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(minor) / 100,
  );

function Diferencia({ porcentaje }: { porcentaje: number | null }) {
  if (porcentaje === null) return null;
  const color =
    porcentaje < 0
      ? "bg-emerald-50 text-emerald-700"
      : porcentaje > 0
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span
      title="Diferencia por unidad contra el producto elegido"
      className={`ml-1.5 rounded px-1 text-[10px] font-semibold ${color}`}
    >
      {porcentaje > 0 ? "+" : porcentaje < 0 ? "−" : "±"}
      {Math.abs(porcentaje)}%
    </span>
  );
}

function Fila({
  fila,
  mejor,
  onElegir,
  referenciaPorUnidad,
  comparable,
}: {
  fila: Alternativa;
  mejor: boolean;
  onElegir?: (productId: string) => void;
  referenciaPorUnidad?: string | null;
  /** Misma dosis y forma: tiene sentido comparar el precio por unidad. */
  comparable: boolean;
}) {
  const stock = fila.producto?.stock ?? 0;
  const elegible = !!onElegir && !!fila.producto && stock > 0;
  return (
    <li className={`${COLUMNAS} rounded-lg px-2 py-2 hover:bg-slate-50`}>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-800">
            {fila.nombre}
          </span>
          {mejor && (
            <span className="shrink-0 rounded bg-emerald-50 px-1.5 text-[10px] font-semibold leading-4 text-emerald-700">
              Mejor $/u
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {fila.presentacion}
          {fila.laboratorio && (
            <span className="text-slate-400"> · {fila.laboratorio}</span>
          )}
        </span>
        {fila.aviso && (
          <span className="block text-[11px] text-amber-700">{fila.aviso}</span>
        )}
      </span>
      <span className="text-right tabular-nums">
        <span className="block text-sm font-semibold text-slate-800">
          {money(precioAlternativa(fila))}
        </span>
        <span className="block text-[11px] text-slate-500">
          {fila.precioPorUnidadMinor ? (
            <>
              {money(fila.precioPorUnidadMinor)} / u
              {comparable && (
                <Diferencia
                  porcentaje={diferenciaPorUnidad(fila, referenciaPorUnidad)}
                />
              )}
            </>
          ) : (
            " "
          )}
        </span>
      </span>
      <span className="flex flex-col items-end justify-center gap-0.5 text-right">
        {elegible ? (
          <>
            <button
              type="button"
              onClick={() => onElegir!(fila.producto!.id)}
              className="h-7 w-full rounded-md border border-marca-619 bg-white text-xs font-semibold text-marca-535 hover:bg-teal-50"
            >
              Elegir
            </button>
            <span className="text-[11px] tabular-nums text-teal-700">
              {stock} en stock
            </span>
          </>
        ) : fila.producto ? (
          <span
            className={`text-xs font-semibold ${stock > 0 ? "text-teal-700" : "text-amber-700"}`}
          >
            {stock > 0 ? `${stock} en stock` : "Sin stock"}
          </span>
        ) : (
          <span className="text-xs text-slate-400">No cargado</span>
        )}
      </span>
    </li>
  );
}

// Mismas columnas en el encabezado y en todas las filas.
const COLUMNAS =
  "grid grid-cols-[minmax(0,1fr)_10rem_6rem] items-center gap-x-5";

export function ListaEquivalentes({
  datos,
  onElegir,
  referenciaPorUnidad,
}: {
  datos: Equivalentes;
  onElegir?: (productId: string) => void;
  /** Precio por unidad del producto elegido, para comparar. */
  referenciaPorUnidad?: string | null;
}) {
  const confirmados = datos.equivalentes.filter((fila) => !fila.aviso);
  const aConfirmar = datos.equivalentes.filter((fila) => fila.aviso);
  const grupos = [
    {
      titulo: "Equivalentes",
      detalle:
        "Misma droga, concentración y forma. Cambia la marca o el envase.",
      filas: confirmados,
      comparable: true,
    },
    {
      titulo: "Para confirmar",
      detalle:
        "Misma droga y forma, pero falta un dato para asegurar que es la misma concentración.",
      filas: aConfirmar,
      comparable: false,
      plegado: true,
    },
    {
      titulo: datos.composicionAbierta
        ? "Productos relacionados"
        : `Otros con ${datos.principioActivo}`,
      detalle: datos.composicionAbierta
        ? "Fórmulas parecidas: la composición puede variar entre marcas."
        : "Otra concentración o forma farmacéutica.",
      filas: datos.mismaDroga,
      comparable: false,
    },
  ].filter((grupo) => grupo.filas.length);
  if (!grupos.length)
    return (
      <p className="text-sm text-slate-500">
        No hay otras presentaciones con esta droga en la base.
      </p>
    );
  return (
    <div className="space-y-5">
      <div
        aria-hidden
        className={`${COLUMNAS} border-b border-slate-200 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400`}
      >
        <span>Producto</span>
        <span className="text-right">Precio</span>
        <span className="text-right">Stock</span>
      </div>
      {grupos.map((grupo) => (
        <Grupo
          key={grupo.titulo}
          {...grupo}
          onElegir={onElegir}
          referenciaPorUnidad={referenciaPorUnidad}
        />
      ))}
    </div>
  );
}

function Grupo({
  titulo,
  detalle,
  filas,
  comparable,
  plegado = false,
  onElegir,
  referenciaPorUnidad,
}: {
  titulo: string;
  detalle: string;
  filas: Alternativa[];
  comparable: boolean;
  plegado?: boolean;
  onElegir?: (productId: string) => void;
  referenciaPorUnidad?: string | null;
}) {
  const [abierto, setAbierto] = useState(!plegado);
  const mejor = comparable ? mejorPorUnidad(filas) : undefined;
  return (
    <section aria-label={titulo}>
      <div className="mb-1 flex items-start justify-between gap-3 px-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-800 first-letter:uppercase">
            {titulo}{" "}
            <span className="font-normal text-slate-400">({filas.length})</span>
          </h4>
          <p className="text-xs text-slate-500">{detalle}</p>
        </div>
        {plegado && (
          <button
            type="button"
            aria-expanded={abierto}
            onClick={() => setAbierto((actual) => !actual)}
            className="shrink-0 text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            {abierto ? "Ocultar" : "Ver"}
          </button>
        )}
      </div>
      {abierto && (
        <ul className="divide-y divide-slate-100">
          {filas.map((fila) => (
            <Fila
              key={fila.itemId}
              fila={fila}
              mejor={fila.itemId === mejor}
              onElegir={onElegir}
              referenciaPorUnidad={referenciaPorUnidad}
              comparable={comparable}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// Bloque para la ficha del producto y el buscador de Inicio.
export function EquivalentesPanel({
  estado,
}: {
  estado: EstadoEquivalentes | undefined;
}) {
  if (!estado) return null;
  if (estado.tipo === "cargando")
    return <p className="text-sm text-slate-500">Buscando equivalentes…</p>;
  if (estado.tipo === "error")
    return <p className="text-sm text-red-700">{estado.mensaje}</p>;
  return <ListaEquivalentes datos={estado.datos} />;
}

export function EquivalentesSeccion(props: {
  token: string;
  organizationId: string;
  branchId?: string;
  consulta?: ConsultaEquivalentes;
}) {
  const estado = useEquivalentes(
    props.token,
    props.organizationId,
    props.branchId,
    props.consulta,
  );
  if (!estado) return null;
  return (
    <section
      aria-label="Equivalentes del medicamento"
      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <h3 className="mb-2 flex items-center gap-2.5 text-sm font-semibold text-slate-700">
        <Layers size={17} className="text-teal-700" aria-hidden />
        Equivalentes y productos relacionados
      </h3>
      <EquivalentesPanel estado={estado} />
    </section>
  );
}

// Ventas: una pastilla chica junto al nombre que abre el panel aparte. Sin
// equivalentes no se muestra nada, para no cambiar la caja del producto.
export function EquivalentesPastilla({
  token,
  organizationId,
  branchId,
  consulta,
  nombre,
  actual,
  onElegir,
}: {
  token: string;
  organizationId: string;
  branchId?: string;
  consulta?: ConsultaEquivalentes;
  nombre: string;
  /** El producto elegido en la venta, arriba del panel para comparar. */
  actual?: {
    presentacion?: string | null;
    laboratorio?: string | null;
    precioMinor?: string;
    disponibles?: number;
  };
  onElegir: (productId: string) => void;
}) {
  const estado = useEquivalentes(token, organizationId, branchId, consulta);
  const [abierto, setAbierto] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (abierto) dialogo.current?.showModal();
    else dialogo.current?.close();
  }, [abierto]);
  if (estado?.tipo !== "listo") return null;
  const referencia = precioPorUnidad(actual?.precioMinor, actual?.presentacion);
  const confirmados = estado.datos.equivalentes.filter(
    (fila) => !fila.aviso,
  ).length;
  const cantidad =
    confirmados ||
    estado.datos.equivalentes.length ||
    estado.datos.mismaDroga.length;
  if (!cantidad) return null;
  // Lo que dice la pastilla: equivalentes seguros, si no los que hay que
  // confirmar, si no los relacionados.
  const etiqueta = confirmados
    ? `${cantidad} equiv.`
    : estado.datos.equivalentes.length
      ? `${cantidad} a confirmar`
      : `${cantidad} relac.`;
  return (
    <>
      <button
        type="button"
        title={
          confirmados
            ? `Ver ${cantidad} equivalentes para comparar`
            : estado.datos.equivalentes.length
              ? `Ver ${cantidad} posibles equivalentes (falta confirmar la dosis)`
              : `Ver ${cantidad} productos relacionados`
        }
        onClick={() => setAbierto(true)}
        className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 align-middle text-[10px] font-medium leading-4 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
      >
        <ArrowLeftRight size={9} aria-hidden />
        {etiqueta}
      </button>
      <dialog
        ref={dialogo}
        aria-label={`Equivalentes de ${nombre}`}
        onCancel={(event) => {
          event.preventDefault();
          setAbierto(false);
        }}
        className="m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-velo/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex max-h-[88dvh] flex-col">
          <header className="border-b border-slate-100 px-6 pb-4 pt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                <span className="rounded-lg bg-teal-50 p-1.5 text-teal-700">
                  <ArrowLeftRight size={16} aria-hidden />
                </span>
                Alternativas para comparar
              </h3>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setAbierto(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                  Elegido en la venta
                </p>
                <p className="truncate text-lg font-semibold text-slate-900">
                  {nombre}
                </p>
                <p className="truncate text-sm text-slate-600">
                  {[actual?.presentacion, actual?.laboratorio]
                    .filter(Boolean)
                    .join(" · ") || "Presentación no informada"}
                  {actual?.disponibles !== undefined && (
                    <span className="text-teal-700">
                      {" "}
                      · {actual.disponibles} disponibles
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right tabular-nums">
                <p className="text-xl font-bold text-teal-800">
                  {actual?.precioMinor ? money(actual.precioMinor) : "—"}
                </p>
                {referencia && (
                  <p className="text-xs text-slate-600">
                    {money(referencia)} / u
                  </p>
                )}
              </div>
            </div>
          </header>
          <div className="overflow-y-auto px-6 py-4">
            <ListaEquivalentes
              datos={estado.datos}
              referenciaPorUnidad={referencia}
              onElegir={(productId) => {
                setAbierto(false);
                onElegir(productId);
              }}
            />
          </div>
        </div>
      </dialog>
    </>
  );
}

// Inicio: se consulta recién cuando el usuario lo pide.
export function EquivalentesDesplegable({
  token,
  organizationId,
  branchId,
  consulta,
}: {
  token: string;
  organizationId: string;
  branchId?: string;
  consulta: ConsultaEquivalentes;
}) {
  const [abierto, setAbierto] = useState(false);
  const estado = useEquivalentes(
    token,
    organizationId,
    branchId,
    consulta,
    abierto,
  );
  if (!branchId) return null;
  return (
    <div className="border-t border-slate-100 py-3">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((actual) => !actual)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
      >
        <ArrowLeftRight size={13} aria-hidden />
        {abierto
          ? "Ocultar equivalentes"
          : "Ver equivalentes y productos relacionados"}
      </button>
      {abierto && (
        <div className="mt-3">
          <EquivalentesPanel estado={estado} />
        </div>
      )}
    </div>
  );
}
